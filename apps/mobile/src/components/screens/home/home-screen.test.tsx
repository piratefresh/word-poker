/**
 * The street menu (STO-597): each mode slab walks through the door before opening its screen.
 * Home's Coin Store entry is behind `EXPO_PUBLIC_COIN_STORE` (STO-346): off until table buy-ins
 * spend the Wallet. The verify-email prompt (STO-566) rides on the session alone.
 */

import { act, fireEvent, render, type RenderResult } from "@testing-library/react-native";

import { router, useFocusEffect } from "expo-router";
import { BackHandler, StyleSheet } from "react-native";

import { authClient } from "@/auth/client/auth-client";

import { HomeScreen } from "./home-screen";

// The coordinator leaves the online table first, which loads Colyseus; these tests only need the call.
jest.mock("@/auth/client/session-coordinator", () => ({
  changeSession: (change: () => Promise<unknown>) => change(),
  setAutoRestore: jest.fn(async () => {}),
}));

let mockRequestedOffline: string | undefined;
jest.mock("expo-router", () => ({ router: { push: jest.fn(), setParams: jest.fn() }, useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ offline: mockRequestedOffline }),
}));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock").default,
);
let mockSessionUser: { email: string; emailVerified: boolean } | null = null;
jest.mock("@/auth/client/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser ? { user: mockSessionUser } : null }),
    signOut: jest.fn(),
    sendVerificationEmail: jest.fn(),
  },
}));

let mockConnected: boolean | undefined;
jest.mock("expo-network", () => ({ useNetworkState: () => ({ isConnected: mockConnected }) }));

const mockDisk = new Map<string, string>();
jest.mock("@/lib/storage/claim-store", () => ({
  TUTORIAL_DONE: "tutorial-done",
  readItem: (key: string) => mockDisk.get(key) ?? null,
  writeItem: (key: string, value: string) => mockDisk.set(key, value),
}));

const mockDismissStreakBanner = jest.fn();
const mockDismissLevelUp = jest.fn();
let mockStreakBanner: { day: number; reward: number } | null = null;
let mockLevelUp: { level: number; reward: number } | null = null;
jest.mock("@/lib/quests/quests-provider", () => ({
  useQuests: () => ({
    streakBanner: mockStreakBanner,
    dismissStreakBanner: mockDismissStreakBanner,
    levelUp: mockLevelUp,
    dismissLevelUp: mockDismissLevelUp,
    state: null,
  }),
}));

/** Every sentence an `@expo/ui` text carries: the library keeps its string in a `text` prop. */
function libraryTexts(tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const element = node as { props?: Record<string, unknown>; children?: unknown };
    if (typeof element.props?.text === "string") found.push(element.props.text);
    walk(element.children);
  };
  walk(tree);
  return found;
}

/**
 * `@expo/ui` buttons render as native adapter views: the press handler travels as
 * `onButtonPress` rather than as a React Native prop.
 */
function press(view: RenderResult, testID: string) {
  const node = view.getByTestId(testID);
  return act(async () => {
    (node.props.onButtonPress ?? node.props.onPress ?? node.props.onClick)?.();
  });
}

const saved = process.env.EXPO_PUBLIC_COIN_STORE;

beforeEach(() => {
  mockRequestedOffline = undefined;
  mockSessionUser = { email: "ada@example.com", emailVerified: true };
  mockConnected = undefined;
  mockDisk.clear();
  jest.mocked(useFocusEffect).mockClear();
  mockStreakBanner = null;
  mockLevelUp = null;
  mockDismissStreakBanner.mockReset();
  mockDismissLevelUp.mockReset();
  jest.mocked(router.push).mockReset();
  jest.mocked(authClient.sendVerificationEmail).mockReset();
});

test("the ledger's offline entry waits for the book to close and consumes the request", async () => {
  jest.useFakeTimers();
  mockRequestedOffline = "1";
  const view = await render(<HomeScreen />);
  const focus = jest.mocked(useFocusEffect).mock.calls.at(-1)?.[0];
  const cleanup = focus?.();
  await act(async () => jest.advanceTimersByTime(1249));
  expect(view.queryByTestId("offline-tray")).toBeNull();
  await act(async () => jest.advanceTimersByTime(1));
  expect(view.getByTestId("offline-tray")).toBeOnTheScreen();
  expect(router.setParams).toHaveBeenCalledWith({ offline: undefined });
  if (typeof cleanup === "function") cleanup();
  jest.useRealTimers();
});

afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_COIN_STORE;
  else process.env.EXPO_PUBLIC_COIN_STORE = saved;
});

test("shows the four mode slabs", async () => {
  const view = await render(<HomeScreen />);
  expect(view.getByTestId("street-logo")).toBeTruthy();
  expect(view.queryByTestId("tile-logo")).toBeNull();

  for (const label of ["Play Online", "Play a Friend", "Tutorial", "Offline"]) {
    expect(view.getByLabelText(label)).toBeTruthy();
  }
});

test("rings the Tutorial slab until the guided hand has been played", async () => {
  const ringed = (view: RenderResult) =>
    JSON.stringify(StyleSheet.flatten(view.getByTestId("home-slab-tutorial-face").props.style)).includes(
      '"borderWidth":3',
    );

  expect(ringed(await render(<HomeScreen />))).toBe(true);
  mockDisk.set("tutorial-done", "1");
  expect(ringed(await render(<HomeScreen />))).toBe(false);
});

test("walks through the door, then opens the mode", async () => {
  jest.useFakeTimers();
  const view = await render(<HomeScreen />);

  await fireEvent.press(view.getByTestId("home-slab-online"));
  expect(router.push).not.toHaveBeenCalled();

  await act(async () => jest.runAllTimers());
  expect(router.push).toHaveBeenCalledWith("/online");
  jest.useRealTimers();
});

test("greys out the server modes with no internet, but Offline still opens", async () => {
  mockConnected = false;
  const view = await render(<HomeScreen />);

  for (const key of ["online", "friend"]) {
    expect(view.getByTestId(`home-slab-${key}`).props.accessibilityState.disabled).toBe(true);
  }
  expect(view.getAllByText("Offline")).toHaveLength(2);
  expect(view.getByTestId("home-slab-tutorial").props.accessibilityState.disabled).toBe(false);

  await fireEvent.press(view.getByTestId("home-slab-online"));
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-wild")).toBeTruthy();
  expect(router.push).not.toHaveBeenCalled();
});

test("opens Offline's choices, and Wild Power starts a wild table", async () => {
  jest.useFakeTimers();
  const view = await render(<HomeScreen />);
  expect(view.queryByTestId("offline-wild")).toBeNull();

  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-normal").props.accessibilityState.checked).toBe(true);
  await fireEvent.press(view.getByTestId("offline-wild"));
  expect(view.getByTestId("offline-normal").props.accessibilityState.checked).toBe(false);
  expect(view.getByTestId("offline-wild").props.accessibilityState.checked).toBe(true);
  expect(router.push).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId("offline-deal"));
  await act(async () => jest.runAllTimers());

  expect(router.push).toHaveBeenCalledWith({ pathname: "/offline", params: { powers: "wild", chips: 1_000 } });
  jest.useRealTimers();
});

test("opens the Coin Store from the coin pill only with the flag on", async () => {
  delete process.env.EXPO_PUBLIC_COIN_STORE;
  expect((await render(<HomeScreen />)).getByTestId("home-credits").props.accessibilityState?.disabled).toBe(true);

  process.env.EXPO_PUBLIC_COIN_STORE = "1";
  await fireEvent.press((await render(<HomeScreen />)).getByTestId("home-credits"));
  expect(router.push).toHaveBeenCalledWith("/store");
});

test("shows no streak banner when none is set", async () => {
  const { queryByTestId } = await render(<HomeScreen />);

  expect(queryByTestId("quest-streak-banner")).toBeNull();
});

test("shows the streak banner, and dismisses it on tap", async () => {
  mockStreakBanner = { day: 4, reward: 125 };

  const { getByTestId, getByText } = await render(<HomeScreen />);
  expect(getByText("DAY 4 STREAK · +125 COINS")).toBeTruthy();

  await fireEvent.press(getByTestId("quest-streak-banner"));
  expect(mockDismissStreakBanner).toHaveBeenCalledTimes(1);
});

test("shows the level-up banner, and dismisses it on tap", async () => {
  mockLevelUp = { level: 3, reward: 350 };

  const { getByTestId, getByText } = await render(<HomeScreen />);
  expect(getByText("LEVEL 3 REACHED · +350 COINS")).toBeTruthy();

  await fireEvent.press(getByTestId("level-up-banner"));
  expect(mockDismissLevelUp).toHaveBeenCalledTimes(1);
});

test("shows no level pill without quest state", async () => {
  const { queryByTestId } = await render(<HomeScreen />);

  expect(queryByTestId("home-level")).toBeNull();
});

test("prompts an unverified player to verify, and resends the mail", async () => {
  mockSessionUser = { email: "ada@example.com", emailVerified: false };
  jest.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: { status: true }, error: null } as never);

  const view = await render(<HomeScreen />);

  expect(libraryTexts(view.toJSON())).toContain("Verify your email to claim 5,000 coins");

  await press(view, "home-verify-resend");

  // The link returns to the app on a device (jest-expo runs the iOS platform); the web build
  // sends it to this origin's root instead.
  expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
    email: "ada@example.com",
    callbackURL: "wordpoker://",
  });
  expect(view.getByTestId("home-verify-resend").props.label).toBe("Sent — check your inbox");
});

test("keeps the prompt off a verified player's Home, and a signed-out visitor's", async () => {
  expect((await render(<HomeScreen />)).queryByTestId("home-verify")).toBeNull();

  mockSessionUser = null;

  expect((await render(<HomeScreen />)).queryByTestId("home-verify")).toBeNull();
});

for (const testID of ["offline-close", "offline-backdrop"]) {
  test(testID + " dismisses the tray without navigating", async () => {
    const view = await render(<HomeScreen />);
    await fireEvent.press(view.getByTestId("home-slab-offline"));
    await fireEvent.press(view.getByTestId(testID));
    expect(view.queryByTestId("offline-tray")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });
}

test("restores the selected mode when the picker opens again", async () => {
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  await fireEvent.press(view.getByTestId("offline-wild"));
  await fireEvent.press(view.getByTestId("offline-close"));
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-wild").props.accessibilityState.checked).toBe(true);
  expect(mockDisk.get("offline-mode")).toBe("wild");
});

test("DEAL defaults to the normal offline route on 1,000 practice chips, and says it is free", async () => {
  jest.useFakeTimers();
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-chips-1000").props.accessibilityState.checked).toBe(true);
  expect(view.getByLabelText("1,000 practice chips")).toBeTruthy();
  expect(view.getByLabelText("Deal. Free practice game, your coins are not used.")).toBeTruthy();
  expect(view.getByTestId("offline-deal-note")).toHaveTextContent("Everyone gets 1,000 practice chips. Your coins stay in your wallet.");
  await fireEvent.press(view.getByTestId("offline-deal"));
  await act(async () => jest.runAllTimers());
  expect(router.push).toHaveBeenCalledWith({ pathname: "/offline", params: { chips: 1_000 } });
  jest.useRealTimers();
});

test("STARTING CHIPS deals the picked stack and remembers it", async () => {
  jest.useFakeTimers();
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  await fireEvent.press(view.getByLabelText("2,500 practice chips"));
  expect(view.getByTestId("offline-chips-2500").props.accessibilityState.checked).toBe(true);
  expect(view.getByTestId("offline-chips-1000").props.accessibilityState.checked).toBe(false);
  expect(view.getByTestId("offline-deal-note")).toHaveTextContent("Everyone gets 2,500 practice chips. Your coins stay in your wallet.");
  expect(mockDisk.get("offline-starting-chips")).toBe("2500");

  await fireEvent.press(view.getByTestId("offline-close"));
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-chips-2500").props.accessibilityState.checked).toBe(true);
  await fireEvent.press(view.getByTestId("offline-deal"));
  await act(async () => jest.runAllTimers());
  expect(router.push).toHaveBeenCalledWith({ pathname: "/offline", params: { chips: 2_500 } });
  jest.useRealTimers();
});

test("a stored pick the picker no longer offers falls back to 1,000", async () => {
  mockDisk.set("offline-starting-chips", "777");
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  expect(view.getByTestId("offline-chips-1000").props.accessibilityState.checked).toBe(true);
});

test("device back dismisses the tray and removes its listener", async () => {
  const remove = jest.fn();
  const listener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  const focus = jest.mocked(useFocusEffect).mock.calls.at(-1)?.[0];
  const cleanup = focus?.();
  const onBack = listener.mock.calls[0]?.[1];
  await act(async () => expect(onBack?.({ type: "hardwareBackPress", timeStamp: 0 })).toBe(true));
  expect(view.queryByTestId("offline-tray")).toBeNull();
  if (typeof cleanup === "function") cleanup();
  expect(remove).toHaveBeenCalled();
  listener.mockRestore();
});

test("leaving the Home tab closes the tray", async () => {
  const view = await render(<HomeScreen />);
  const blur = jest.mocked(useFocusEffect).mock.calls[0]?.[0]();
  await fireEvent.press(view.getByTestId("home-slab-offline"));
  await act(async () => { if (typeof blur === "function") blur(); });
  expect(view.queryByTestId("offline-tray")).toBeNull();
});
