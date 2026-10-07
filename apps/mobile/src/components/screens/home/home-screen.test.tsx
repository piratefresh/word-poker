/**
 * Home's Coin Store entry is behind `EXPO_PUBLIC_COIN_STORE` (STO-346): off until table buy-ins
 * spend the Wallet.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { HomeScreen } from "./home-screen";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { email: "ada@example.com" } } }), signOut: jest.fn() },
}));

const mockDismissStreakBanner = jest.fn();
const mockDismissLevelUp = jest.fn();
let mockStreakBanner: { day: number; reward: number } | null = null;
let mockLevelUp: { level: number; reward: number } | null = null;
jest.mock("@/lib/quests-provider", () => ({
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

const saved = process.env.EXPO_PUBLIC_COIN_STORE;

beforeEach(() => {
  mockStreakBanner = null;
  mockLevelUp = null;
  mockDismissStreakBanner.mockReset();
  mockDismissLevelUp.mockReset();
});

afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_COIN_STORE;
  else process.env.EXPO_PUBLIC_COIN_STORE = saved;
});

test("shows no Coin Store or Quests without the flag", async () => {
  delete process.env.EXPO_PUBLIC_COIN_STORE;

  const texts = libraryTexts((await render(<HomeScreen />)).toJSON());

  expect(texts).toContain("Tutorial");
  expect(texts).not.toContain("Coin Store");
  expect(texts).not.toContain("Quests");
});

test("shows the Coin Store and Quests with the flag on", async () => {
  process.env.EXPO_PUBLIC_COIN_STORE = "1";

  const texts = libraryTexts((await render(<HomeScreen />)).toJSON());
  expect(texts).toContain("Coin Store");
  expect(texts).toContain("Quests");
});

test("shows no streak banner when none is set", async () => {
  const texts = libraryTexts((await render(<HomeScreen />)).toJSON());

  expect(texts.some((text) => text.includes("STREAK"))).toBe(false);
});

test("shows the streak banner, and dismisses it on tap", async () => {
  mockStreakBanner = { day: 4, reward: 125 };

  const { getByTestId, toJSON } = await render(<HomeScreen />);
  expect(libraryTexts(toJSON())).toContain("DAY 4 STREAK · +125 COINS");

  fireEvent.press(getByTestId("quest-streak-banner"));
  expect(mockDismissStreakBanner).toHaveBeenCalledTimes(1);
});

test("shows the level-up banner, and dismisses it on tap", async () => {
  mockLevelUp = { level: 3, reward: 350 };

  const { getByTestId, toJSON } = await render(<HomeScreen />);
  expect(libraryTexts(toJSON())).toContain("LEVEL 3 REACHED · +350 COINS");

  fireEvent.press(getByTestId("level-up-banner"));
  expect(mockDismissLevelUp).toHaveBeenCalledTimes(1);
});

test("shows no level strip without quest state", async () => {
  const { queryByTestId } = await render(<HomeScreen />);

  // The strip is RN content under an `RNHostView`; its own test file renders it directly.
  expect(queryByTestId("level-strip")).toBeNull();
});
