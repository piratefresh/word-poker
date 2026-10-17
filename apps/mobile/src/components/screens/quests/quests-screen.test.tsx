/**
 * The quests screen's states: signed out, unverified, and the wallet/streak/catalog once the
 * provider has something to show. `useQuests()` is the seam; its own suite judges the fetching.
 */

import { render } from "@testing-library/react-native";

import { QuestsScreen } from "./quests-screen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() } }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: jest.fn() } }));

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

beforeEach(() => {
  mockRefresh.mockReset();
  mockQuestsValue = { coins: null, state: null };
});

test("asks a signed-out player to sign in", async () => {
  useSession.mockReturnValue({ data: null });

  const texts = libraryTexts((await render(<QuestsScreen />)).toJSON());
  expect(texts).toContain("Sign in to earn coins");
});

test("asks an unverified player to verify", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: false } } });

  const texts = libraryTexts((await render(<QuestsScreen />)).toJSON());
  expect(texts).toContain("Verify your email to earn coins");
});

test("pulls a fresh read on mount", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });

  await render(<QuestsScreen />);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

test("shows the wallet total, the streak day, and every catalog quest's title and progress", async () => {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified: true } } });
  mockQuestsValue = {
    coins: 5250,
    state: {
      streak: { current: 3, creditedToday: null },
      quests: [{ id: "win-word-2", progress: 1, done: true }],
    },
  };

  const texts = libraryTexts((await render(<QuestsScreen />)).toJSON());

  expect(texts).toContain("5,250 COINS");
  expect(texts.some((text) => text.includes("DAY 3"))).toBe(true);
  // A done quest shows the check, not a fraction.
  expect(texts).toContain("SHORT AND SWEET");
  expect(texts).toContain("✓");
  // An untouched quest shows 0 of its goal.
  expect(texts.some((text) => text === "0/25")).toBe(true);
});
