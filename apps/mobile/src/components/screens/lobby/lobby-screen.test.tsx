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
let mockCoins: number | null = 5450;
const mockRefreshCoins = jest.fn();
jest.mock("@/lib/quests/quests-provider", () => ({
  useQuests: () => ({ coins: mockCoins, refreshCoins: mockRefreshCoins, state: { level: 2 } }),
}));
let mockGuest = false;
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "Dylan", isAnonymous: mockGuest } } }) },
}));
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
  mockCoins = 5450;
  mockGuest = false;
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

test("keeps full rooms visible with a disabled join action that points to a table that fits", async () => {
  const view = await show([room("hero", { metadata: { ...room("hero").metadata, name: "Corner Table" } }), room("full", { clients: 4 })]);
  expect(within(view.getByTestId("lobby-room-full")).getByText("FULL")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("lobby-room-full"));
  expect(view.getByTestId("room-details-join")).toBeDisabled();
  expect(view.getByTestId("room-details-join").props.accessibilityLabel).toBe("Join unavailable, this table is full.");
  expect(view.getByTestId("room-details-join-note")).toHaveTextContent(
    "A seat opens when someone leaves. Corner Table has 3 free seats.",
  );
  expect(joinTable).not.toHaveBeenCalled();
});

test("puts the price on Join and shows the Wallet it moves", async () => {
  const view = await show([room("hero", { metadata: { ...room("hero").metadata, name: "Corner Table" } }), room("row")]);
  const join = view.getByTestId("parlor-featured-join");
  expect(within(join).getByText("JOIN")).toBeOnTheScreen();
  expect(within(join).getByText("500")).toBeOnTheScreen();
  expect(join.props.accessibilityLabel).toBe("Join Corner Table for 500 coins. You have 5,450 coins.");
  expect(view.getByText("Wallet 5,450 → 4,950 coins")).toBeOnTheScreen();
  expect(within(view.getByTestId("lobby-room-row")).getByText("JOIN · 500")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("lobby-room-row"));
  expect(view.getByTestId("room-details-join-note")).toHaveTextContent(
    "500 coins become chips at this table. Whatever is left comes back as coins when you leave.",
  );
});

test("disables Join when the Wallet is short, names the shortfall, and points to the store and quests", async () => {
  mockCoins = 1200;
  const high = (roomId: string) => room(roomId, { metadata: { ...room(roomId).metadata, buyIn: 5000 } });
  const view = await show([high("hero"), high("row")]);
  const join = view.getByTestId("parlor-featured-join");
  expect(join).toBeDisabled();
  expect(within(join).getByText("NEED 3,800 MORE COINS")).toBeOnTheScreen();
  expect(join.props.accessibilityLabel).toBe("Join unavailable. You need 5,000 coins and have 1,200.");
  expect(view.getByTestId("parlor-featured-join-note")).toHaveTextContent("You have 1,200 coins. This table takes 5,000.");
  expect(within(view.getByTestId("lobby-room-row")).getByText("NEED 3,800 MORE")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("parlor-featured-join-store"));
  expect(router.push).toHaveBeenCalledWith("/store");
  await fireEvent.press(view.getByTestId("parlor-featured-join-quests"));
  expect(router.push).toHaveBeenCalledWith("/quests");
  expect(joinTable).not.toHaveBeenCalled();
});

test("holds Join while the seat is taken and says the coins are moving", async () => {
  jest.mocked(joinTable).mockReturnValue(new Promise(() => {}));
  const view = await show([room("hero")]);
  await fireEvent.press(view.getByTestId("parlor-featured-join"));
  const join = view.getByTestId("parlor-featured-join");
  expect(within(join).getByText("TAKING YOUR SEAT ···")).toBeOnTheScreen();
  expect(join).toBeDisabled();
  expect(view.getByTestId("parlor-featured-join-note")).toHaveTextContent("Moving 500 coins to the table");
});

test("closes the sheet on a refusal, shows the server's words at the top, and RETRY joins again", async () => {
  jest.mocked(joinTable).mockRejectedValueOnce(new Error("Your coins couldn't be reached. Try again."));
  const view = await show([room("hero"), room("row")]);
  await fireEvent.press(view.getByTestId("lobby-room-row"));
  await fireEvent.press(view.getByTestId("room-details-join"));
  await waitFor(() => expect(view.getByTestId("lobby-refusal")).toHaveTextContent(/Your coins couldn't be reached\. Try again\./));
  expect(view.getByTestId("room-details-sheet").props.isPresented).toBe(false);
  expect(mockRefreshCoins).toHaveBeenCalled();
  await fireEvent.press(view.getByTestId("lobby-refusal-retry"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "row" } }));
  expect(joinTable).toHaveBeenCalledTimes(2);
  expect(view.queryByTestId("lobby-refusal")).toBeNull();
});

test("shows a seated player the way back, with no cost", async () => {
  jest.mocked(useActiveRoomId).mockReturnValue("hero");
  const view = await show([room("hero"), room("row")]);
  expect(view.getByText("YOU'RE SEATED")).toBeOnTheScreen();
  expect(within(view.getByTestId("parlor-featured-join")).getByText("BACK TO YOUR SEAT")).toBeOnTheScreen();
  expect(view.queryByTestId("parlor-featured-join-note")).toBeNull();
});

test("labels seated, locked and guest rows", async () => {
  jest.mocked(useActiveRoomId).mockReturnValue("mine");
  const view = await show([room("hero"), room("mine"), room("locked", { locked: true })]);
  expect(within(view.getByTestId("lobby-room-mine")).getByText("YOUR SEAT")).toBeOnTheScreen();
  expect(within(view.getByTestId("lobby-room-locked")).getByText("LOCKED")).toBeOnTheScreen();
  await view.unmount();
  mockGuest = true;
  mockCoins = null;
  const guest = await show([room("hero"), room("row")]);
  expect(within(guest.getByTestId("lobby-room-row")).getByText("ACCOUNT NEEDED")).toBeOnTheScreen();
  expect(guest.getByTestId("parlor-featured-join")).toBeDisabled();
});

test("points a player with no coins to quests, the store, and free bot games", async () => {
  mockCoins = 0;
  const view = await show([room("hero")]);
  expect(view.getByTestId("lobby-out-of-coins")).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("lobby-out-of-coins-store"));
  expect(router.push).toHaveBeenCalledWith("/store");
});

test("re-reads the Wallet whenever the lobby comes into focus", async () => {
  await show([room("hero")]);
  expect(mockRefreshCoins).toHaveBeenCalled();
});

test("shows no out-of-coins notice to a player who can afford a table", async () => {
  const view = await show([room("hero")]);
  expect(view.queryByTestId("lobby-out-of-coins")).toBeNull();
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
