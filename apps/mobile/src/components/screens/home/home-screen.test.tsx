/**
 * Home's Coin Store entry is behind `EXPO_PUBLIC_COIN_STORE` (STO-346): off until table buy-ins
 * spend the Wallet.
 */

import { render } from "@testing-library/react-native";

import { HomeScreen } from "./home-screen";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { email: "ada@example.com" } } }), signOut: jest.fn() },
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

afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_COIN_STORE;
  else process.env.EXPO_PUBLIC_COIN_STORE = saved;
});

test("shows no Coin Store without the flag", async () => {
  delete process.env.EXPO_PUBLIC_COIN_STORE;

  const texts = libraryTexts((await render(<HomeScreen />)).toJSON());

  expect(texts).toContain("Tutorial");
  expect(texts).not.toContain("Coin Store");
});

test("shows the Coin Store with the flag on", async () => {
  process.env.EXPO_PUBLIC_COIN_STORE = "1";

  expect(libraryTexts((await render(<HomeScreen />)).toJSON())).toContain("Coin Store");
});
