/**
 * The quests screen's states: signed out, unverified, and the wallet/streak/catalog once the
 * provider has something to show. `useQuests()` is the seam; its own suite judges the fetching.
 */

import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { QuestsScreen } from "./quests-screen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() } }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockRefresh = jest.fn();
let mockQuestsValue: {
  coins: number | null;
  state: unknown;
} = { coins: null, state: null };
jest.mock("@/lib/quests/quests-provider", () => ({
  useQuests: () => ({ ...mockQuestsValue, refresh: mockRefresh }),
}));

import { authClient } from "@/auth/client/auth-client";

const useSession = jest.mocked(authClient.useSession) as unknown as jest.Mock;

beforeEach(() => {
  mockRefresh.mockReset();
  mockQuestsValue = { coins: null, state: null };
});

test("asks a signed-out player to sign in", async () => {
  useSession.mockReturnValue({ data: null });

  await render(<QuestsScreen />);
  expect(screen.getByText("Sign in to earn coins")).toBeTruthy();
  expect(screen.queryByTestId("quest-wallet")).toBeNull();
});

test("asks an unverified player to verify", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: false } } });

  await render(<QuestsScreen />);
  expect(screen.getByText("Verify your email to earn coins")).toBeTruthy();
});

test("pulls a fresh read on mount", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });

  await render(<QuestsScreen />);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

test("shows the wallet, the streak, and the open quests under TO DO", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });
  mockQuestsValue = {
    coins: 5250,
    state: {
      streak: { current: 3, creditedToday: null },
      quests: [{ id: "win-word-2", progress: 1, done: true }],
    },
  };

  await render(<QuestsScreen />);

  expect(within(screen.getByTestId("quest-wallet")).getByText("5,250")).toBeTruthy();
  expect(screen.getByText("Day 3 streak. Come back tomorrow for +125.")).toBeTruthy();

  // TO DO is the open tab: it counts 14 open quests and leaves the done one off.
  expect(within(screen.getByTestId("quests-tab-todo")).getByText("14")).toBeTruthy();
  expect(screen.queryByTestId("quest-row-win-word-2")).toBeNull();

  // An untouched counting quest shows 0 of its goal and its description.
  const nightOut = within(screen.getByTestId("quest-row-hands-25"));
  expect(nightOut.getByText("0/25")).toBeTruthy();
  expect(nightOut.getByText("Play 25 hands.")).toBeTruthy();
});

test("the DONE tab holds the done quests with their tick and paid reward", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });
  mockQuestsValue = {
    coins: 5250,
    state: {
      streak: { current: 3, creditedToday: null },
      quests: [{ id: "win-word-2", progress: 1, done: true }],
    },
  };

  await render(<QuestsScreen />);
  expect(within(screen.getByTestId("quests-tab-done")).getByText("1")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("quests-tab-done"));

  const done = within(screen.getByTestId("quest-row-win-word-2"));
  expect(done.getByText("Short and sweet")).toBeTruthy();
  expect(done.getByText("✓")).toBeTruthy();
  expect(done.getByText("+100 PAID")).toBeTruthy();
  expect(screen.queryByTestId("quest-row-hands-25")).toBeNull();
});

test("starts the streak prompt from zero", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });
  mockQuestsValue = { coins: 0, state: { streak: { current: 0, creditedToday: null }, quests: [] } };

  await render(<QuestsScreen />);
  expect(screen.getByText("Play today to start your streak.")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("quests-tab-done"));
  expect(screen.getByTestId("quests-done-empty")).toBeTruthy();
});
