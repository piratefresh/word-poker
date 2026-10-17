/**
 * The coin store's states and its buy flow. The SDK wrapper and the wallet client are the seams:
 * their own suites judge RevenueCat and the routes.
 */

import { act, render, waitFor, type RenderResult } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";
import type { CoinPackage } from "@/lib/wallet/coin-offering";
import { fetchCoinOffering, purchaseCoinPack, revenuecatAvailable } from "@/lib/wallet/revenuecat";
import { useRevenueCatReady } from "@/lib/wallet/use-revenuecat";
import { fetchCoinCatalog, fetchWallet, WalletAuthError } from "@/lib/wallet/wallet-client";

import { StoreScreen } from "./store-screen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() } }));
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: jest.fn(), sendVerificationEmail: jest.fn() },
}));
jest.mock("@/lib/wallet/revenuecat", () => ({
  revenuecatAvailable: jest.fn(),
  fetchCoinOffering: jest.fn(),
  purchaseCoinPack: jest.fn(),
}));
jest.mock("@/lib/wallet/use-revenuecat", () => ({ useRevenueCatReady: jest.fn() }));
jest.mock("@/lib/wallet/wallet-client", () => {
  class WalletAuthError extends Error {}
  return { WalletAuthError, fetchWallet: jest.fn(), fetchCoinCatalog: jest.fn() };
});

const useSession = authClient.useSession as unknown as jest.Mock;
const available = jest.mocked(revenuecatAvailable);
const offering = jest.mocked(fetchCoinOffering);
const purchase = jest.mocked(purchaseCoinPack);
const ready = jest.mocked(useRevenueCatReady);
const wallet = jest.mocked(fetchWallet);
const catalog = jest.mocked(fetchCoinCatalog);

const pkg = (productId: string, price: number): CoinPackage => ({
  productId,
  price,
  priceString: `$${price}`,
  handle: { productId },
});

function signedIn(emailVerified = true) {
  useSession.mockReturnValue({ data: { user: { id: "user_1", email: "ada@example.com", emailVerified } } });
}

/** The string an `@expo/ui` text carries in its `text` prop. */
function textOf(view: RenderResult, testID: string): string {
  return String(view.getByTestId(testID).props.text);
}

/**
 * `@expo/ui` buttons render as native adapter views: the press handler and the disabled state
 * travel as `onButtonPress` and a `disabled` modifier rather than as React Native props.
 */
function press(view: RenderResult, testID: string) {
  const node = view.getByTestId(testID);
  return act(async () => {
    (node.props.onButtonPress ?? node.props.onPress ?? node.props.onClick)?.();
  });
}

function isDisabled(view: RenderResult, testID: string): boolean {
  const modifiers = (view.getByTestId(testID).props.modifiers ?? []) as { $type: string; disabled?: boolean }[];
  return modifiers.some((modifier) => modifier.$type === "disabled" && modifier.disabled === true);
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  signedIn();
  available.mockReturnValue(true);
  ready.mockReturnValue(true);
  wallet.mockResolvedValue({ coins: 5000, welcomed: true });
  catalog.mockResolvedValue({
    packs: [
      { productId: "coins_small", coins: 2000 },
      { productId: "coins_large", coins: 30000 },
    ],
  });
  offering.mockResolvedValue({
    packages: [pkg("coins_small", 0.99), pkg("coins_large", 9.99), pkg("coins_mystery", 1.99)],
    display: {},
  });
});

afterEach(() => jest.restoreAllMocks());

test("shows the balance and the mobile-only caption where packs cannot sell", async () => {
  available.mockReturnValue(false);

  const view = await render(<StoreScreen />);

  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("5,000 COINS"));
  expect(view.getByTestId("store-unavailable")).toBeTruthy();
  expect(offering).not.toHaveBeenCalled();
});

test("asks a signed-out player to sign in", async () => {
  wallet.mockRejectedValue(new WalletAuthError());

  const view = await render(<StoreScreen />);

  await waitFor(() => expect(view.getByTestId("store-signed-out")).toBeTruthy());
  expect(view.queryByTestId("wallet-coins")).toBeNull();
});

test("asks an unverified player to verify, and resends the mail", async () => {
  signedIn(false);
  wallet.mockResolvedValue({ coins: 0, welcomed: false });
  jest.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: { status: true }, error: null } as never);

  const view = await render(<StoreScreen />);

  await waitFor(() => expect(view.getByTestId("store-verify")).toBeTruthy());
  await press(view, "store-verify-resend");
  // The card names the platform's destination for the verified mail (jest-expo runs iOS here).
  expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
    email: "ada@example.com",
    callbackURL: "wordpoker://",
  });
});

test("offers no welcome to an unverified player who already has it", async () => {
  signedIn(false);

  const view = await render(<StoreScreen />);

  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("5,000 COINS"));
  expect(view.queryByTestId("store-verify")).toBeNull();
});

test("lists packs with the catalog's amounts and hides one without a grant", async () => {
  const view = await render(<StoreScreen />);

  await waitFor(() => expect(view.getByTestId("store-pack-coins_small")).toBeTruthy());
  expect(view.getByTestId("store-pack-coins_large")).toBeTruthy();
  expect(view.queryByTestId("store-pack-coins_mystery")).toBeNull();
  expect(view.getByTestId("store-buy-coins_small").props.label).toBe("$0.99");
});

test("keeps buy buttons disabled until RevenueCat is logged in", async () => {
  ready.mockReturnValue(false);

  const view = await render(<StoreScreen />);

  await waitFor(() => expect(view.getByTestId("store-buy-coins_small")).toBeTruthy());
  expect(isDisabled(view, "store-buy-coins_small")).toBe(true);
});

test("buys a pack, then re-reads the balance and says what landed", async () => {
  purchase.mockResolvedValue("purchased");
  const view = await render(<StoreScreen />);
  await waitFor(() => expect(view.getByTestId("store-buy-coins_small")).toBeTruthy());
  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("5,000 COINS"));
  wallet.mockResolvedValue({ coins: 7000, welcomed: true });

  await press(view, "store-buy-coins_small");

  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("7,000 COINS"));
  expect(purchase).toHaveBeenCalledWith(expect.objectContaining({ productId: "coins_small" }));
  expect(textOf(view, "store-notice")).toBe("+2,000 COINS ADDED");
});

test("a cancelled purchase restores quietly, without a refetch", async () => {
  purchase.mockResolvedValue("cancelled");
  const view = await render(<StoreScreen />);
  await waitFor(() => expect(view.getByTestId("store-buy-coins_small")).toBeTruthy());
  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("5,000 COINS"));
  wallet.mockClear();

  await press(view, "store-buy-coins_small");

  expect(wallet).not.toHaveBeenCalled();
  expect(view.queryByTestId("store-notice")).toBeNull();
  expect(isDisabled(view, "store-buy-coins_small")).toBe(false);
});

test("a failed purchase shows its error and keeps the balance", async () => {
  purchase.mockRejectedValue(new Error("The store is unavailable."));
  const view = await render(<StoreScreen />);
  await waitFor(() => expect(view.getByTestId("store-buy-coins_small")).toBeTruthy());
  await waitFor(() => expect(textOf(view, "wallet-coins")).toBe("5,000 COINS"));

  await press(view, "store-buy-coins_small");

  await waitFor(() => expect(textOf(view, "store-notice")).toBe("The store is unavailable."));
  expect(textOf(view, "wallet-coins")).toBe("5,000 COINS");
});
