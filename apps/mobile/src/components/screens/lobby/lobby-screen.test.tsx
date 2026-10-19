import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WAITING_PHASE, type RoomSummary } from "@wordpoker/contracts";

import { joinTable, useActiveRoomId } from "@/features/online/room-session";
import { useLobby, type LobbyView } from "@/features/online/use-lobby";
import { lobbyView } from "@/features/online/lobby-view";
import { LobbyScreen } from "./lobby-screen";

jest.mock("@/features/online/use-lobby", () => ({ useLobby: jest.fn() }));
jest.mock("@/features/online/room-session", () => ({
  createTable: jest.fn(), joinTable: jest.fn(), useActiveRoomId: jest.fn(() => null),
  useHostedRoomIds: () => new Set(),
}));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"), useReducedMotion: () => true,
}));
jest.mock("@expo/ui", () => {
  const { View } = jest.requireActual("react-native");
  return { BottomSheet: View, RNHostView: View };
});
jest.mock("@/lib/quests/quests-provider", () => ({ useQuests: () => ({ coins: 5450, state: { level: 2 } }) }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { name: "Dylan" } } }) } }));
jest.mock("@/components/word-builder/haptics", () => ({ haptic: jest.fn() }));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

function room(roomId: string, extra: Partial<RoomSummary> = {}): RoomSummary {
  return {
    roomId, clients: 1, maxClients: 4, locked: false,
    metadata: { name: `Table ${roomId}`, buyIn: 500, smallBlind: 5, bigBlind: 10,
      maxSeats: 4, powerUps: { deal: "off" }, status: WAITING_PHASE },
    ...extra,
  };
}
const refresh = jest.fn();
function show(rooms: RoomSummary[] = [], extra: Partial<LobbyView> = {}) {
  jest.mocked(useLobby).mockReturnValue({ status: "ready", rooms, ...lobbyView(rooms),
    loading: false, refreshing: false, refresh, ...extra });
  return render(<LobbyScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useActiveRoomId).mockReturnValue(null);
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(joinTable).mockResolvedValue(undefined);
});

test("keeps Deal a New Table below the scrollable rooms and opens its sheet", async () => {
  const view = await show([room("hero"), room("row")]);
  expect(within(view.getByTestId("lobby-scroll")).queryByTestId("lobby-create")).toBeNull();
  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(false);
  await fireEvent.press(view.getByTestId("lobby-create"));
  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(true);
  await fireEvent.press(view.getByTestId("create-table-cancel"));
  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(false);
});

test("distinguishes loading, an empty lobby, and a dropped subscription", async () => {
  const loading = await show([], { status: "loading", loading: true });
  expect(loading.getByTestId("lobby-loading")).toBeOnTheScreen();
  expect(loading.queryByTestId("lobby-empty")).toBeNull();
  await loading.unmount();
  const empty = await show();
  expect(empty.getByText("THE SKY IS QUIET")).toBeOnTheScreen();
  await empty.unmount();
  const dropped = await show([room("hero"), room("row")], { status: "error", error: "Connection lost" });
  expect(dropped.getByTestId("lobby-room-row")).toBeOnTheScreen();
  expect(dropped.getByText("Connection lost")).toBeOnTheScreen();
  await fireEvent.press(dropped.getByTestId("lobby-retry"));
  expect(refresh).toHaveBeenCalled();
});

test("filters room rows and explains a filter with no matches", async () => {
  const view = await show([room("hero"), room("classic")]);
  await fireEvent.press(view.getByTestId("lobby-filter-wild-power"));
  expect(view.queryByTestId("lobby-room-classic")).toBeNull();
  expect(view.getByText("No rooms match this filter.")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("lobby-filter-classic"));
  expect(view.getByTestId("lobby-room-classic")).toBeOnTheScreen();
});

test("opens room details before joining the selected room", async () => {
  const view = await show([room("hero"), room("row")]);
  await fireEvent.press(view.getByTestId("lobby-room-row"));
  expect(joinTable).not.toHaveBeenCalled();
  expect(view.getByTestId("room-details-sheet").props.isPresented).toBe(true);
  await fireEvent.press(view.getByTestId("room-details-join"));
  await waitFor(() => expect(joinTable).toHaveBeenCalledWith("row"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "row" } });
});

test("keeps full rooms visible with a disabled join action", async () => {
  const view = await show([room("hero"), room("full", { clients: 4 })]);
  expect(within(view.getByTestId("lobby-room-full")).getByText("FULL")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("lobby-room-full"));
  expect(view.getByTestId("room-details-join")).toBeDisabled();
  expect(joinTable).not.toHaveBeenCalled();
});

test("returns to an existing seat without joining it again", async () => {
  jest.mocked(useActiveRoomId).mockReturnValue("hero");
  const view = await show([room("hero")]);
  await fireEvent.press(view.getByTestId("parlor-featured-join"));
  expect(joinTable).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "hero" } });
});

test("shows a join refusal and refreshes the live list", async () => {
  jest.mocked(joinTable).mockRejectedValue(new Error("Table just closed"));
  const view = await show([room("hero")]);
  await fireEvent.press(view.getByTestId("parlor-featured-join"));
  await waitFor(() => expect(view.getByText("Table just closed")).toBeOnTheScreen());
  expect(refresh).toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

test("honors the create shortcut, clears it, and returns home on Back", async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ create: "1" });
  const view = await show();
  expect(view.getByTestId("create-table-sheet").props.isPresented).toBe(true);
  expect(router.setParams).toHaveBeenCalledWith({ create: undefined });
  await fireEvent.press(view.getByTestId("parlor-back"));
  expect(router.back).toHaveBeenCalled();
});
