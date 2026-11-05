/**
 * The 1a store's states and flows (STO-1045). RevenueCat and the wallet client are the coin packs'
 * seams; `useQuests` and `useTileSets` are mocked, since their providers have their own suites.
 */

import type { QuestStateResponse, TileSetId } from "@wordpoker/contracts";
import { act, fireEvent, render, waitFor, type RenderResult } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";
import { useQuests, type QuestsValue } from "@/lib/quests/quests-provider";
import { useTileSets, type TileSetsValue } from "@/lib/tile-sets/tile-sets-provider";
import type { CoinPackage } from "@/lib/wallet/coin-offering";
import { fetchCoinOffering, purchaseCoinPack, revenuecatAvailable } from "@/lib/wallet/revenuecat";
import { useRevenueCatReady } from "@/lib/wallet/use-revenuecat";
import { fetchCoinCatalog, fetchWallet, WalletAuthError } from "@/lib/wallet/wallet-client";

import { StoreScreen } from "./store-screen";

jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: jest.fn(), sendVerificationEmail: jest.fn() },
}));
jest.mock("@/components/screens/home/home-header", () => ({ HomeHeader: () => null, homeHeaderTop: () => 54 }));
jest.mock("@/lib/quests/quests-provider", () => ({ useQuests: jest.fn() }));
jest.mock("@/lib/tile-sets/tile-sets-provider", () => ({ useTileSets: jest.fn() }));
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
// A plain function, so `resetAllMocks` keeps the insets.
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

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

let quests: QuestsValue;
let tileSets: TileSetsValue;

function questsWith(overrides: Partial<QuestsValue> = {}): QuestsValue {
  return {
    coins: 5000,
    state: null,
    lastCompletions: [],
    streakBanner: null,
    dismissStreakBanner: jest.fn(),
    levelUp: null,
    dismissLevelUp: jest.fn(),
    claimOutcomes: {},
    reportHand: jest.fn(() => null),
    refresh: jest.fn(),
    refreshCoins: jest.fn(async () => 5000),
    ...overrides,
  };
}

function tileSetsWith(owned: TileSetId[] = ["ivory", "jade"], equipped: TileSetId = "ivory"): TileSetsValue {
  const state = { owned, equipped };
  return {
    state,
    equipped,
    buy: jest.fn(async () => ({ ok: true as const, state })),
    equip: jest.fn(async () => ({ ok: true as const, state })),
  };
}

const streakState = (current: number) => ({ streak: { current } }) as unknown as QuestStateResponse;

function signedIn(emailVerified = true) {
  useSession.mockReturnValue({ data: { user: { id: "user_1", email: "ada@example.com", emailVerified } } });
}

/** `@expo/ui` buttons take their press as `onButtonPress`; React Native ones as `onPress`. */
function press(view: RenderResult, testID: string) {
  const node = view.getByTestId(testID);
  return act(async () => {
    (node.props.onButtonPress ?? node.props.onPress ?? node.props.onClick)?.();
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  signedIn();
  quests = questsWith();
  tileSets = tileSetsWith();
  jest.mocked(useQuests).mockImplementation(() => quests);
  jest.mocked(useTileSets).mockImplementation(() => tileSets);
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

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("COINS", () => {
  test("shows the mobile-only caption where packs cannot sell", async () => {
    available.mockReturnValue(false);

    const view = await render(<StoreScreen />);

    await waitFor(() => expect(view.getByTestId("store-unavailable")).toBeTruthy());
    expect(offering).not.toHaveBeenCalled();
  });

  test("asks a signed-out player to sign in", async () => {
    wallet.mockRejectedValue(new WalletAuthError());

    const view = await render(<StoreScreen />);

    await waitFor(() => expect(view.getByTestId("store-signed-out")).toBeTruthy());
    expect(view.queryByTestId("store-pack-coins_small")).toBeNull();
  });

  test("asks an unverified player to verify, and resends the mail", async () => {
    signedIn(false);
    wallet.mockResolvedValue({ coins: 0, welcomed: false });
    jest.mocked(authClient.sendVerificationEmail).mockResolvedValue({ data: { status: true }, error: null } as never);

    const view = await render(<StoreScreen />);

    await waitFor(() => expect(view.getByTestId("store-verify")).toBeTruthy());
    await press(view, "store-verify-resend");
    expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@example.com", callbackURL: "wordpoker://" });
  });

  test("lists packs with the catalog's amounts, bonus and tag, and hides one without a grant", async () => {
    const view = await render(<StoreScreen />);

    await waitFor(() => expect(view.getByTestId("store-pack-coins_small")).toBeTruthy());
    expect(view.queryByTestId("store-pack-coins_mystery")).toBeNull();
    expect(view.getByTestId("store-pack-coins_small").props.accessibilityLabel).toBe("2,000 coins, $0.99");
    expect(view.getByTestId("store-pack-coins_large").props.accessibilityLabel).toBe("30,000 coins, 49% bonus, Best Value, $9.99");
    expect(view.getByText("BEST VALUE")).toBeTruthy();
  });

  test("keeps packs disabled until RevenueCat is logged in", async () => {
    ready.mockReturnValue(false);

    const view = await render(<StoreScreen />);

    await waitFor(() => expect(view.getByTestId("store-pack-coins_small")).toBeTruthy());
    expect(view.getByTestId("store-pack-coins_small").props.accessibilityState.disabled).toBe(true);
  });

  test("buys a pack through the sheet, then toasts what landed and bumps the HUD", async () => {
    purchase.mockResolvedValue("purchased");
    const view = await render(<StoreScreen />);
    await waitFor(() => expect(view.getByTestId("store-pack-coins_large")).toBeTruthy());

    await fireEvent.press(view.getByTestId("store-pack-coins_large"));
    expect(view.getByTestId("store-sheet-line").props.children).toBe("Includes a 49% bonus.");
    expect(view.getByTestId("store-sheet-confirm").props.accessibilityLabel).toBe("Buy for $9.99");
    wallet.mockResolvedValue({ coins: 35000, welcomed: true });
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    await waitFor(() => expect(view.getByTestId("store-toast").props.children).toBe("+30,000 COINS"));
    expect(purchase).toHaveBeenCalledWith(expect.objectContaining({ productId: "coins_large" }));
    expect(quests.refreshCoins).toHaveBeenCalled();
    expect(view.queryByTestId("store-sheet")).toBeNull();
  });

  test("a cancelled purchase leaves the sheet open, without a toast", async () => {
    purchase.mockResolvedValue("cancelled");
    const view = await render(<StoreScreen />);
    await waitFor(() => expect(view.getByTestId("store-pack-coins_small")).toBeTruthy());

    await fireEvent.press(view.getByTestId("store-pack-coins_small"));
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    await waitFor(() => expect(purchase).toHaveBeenCalled());
    expect(view.queryByTestId("store-toast")).toBeNull();
    expect(view.getByTestId("store-sheet")).toBeTruthy();
    await fireEvent.press(view.getByTestId("store-sheet-cancel"));
    expect(view.queryByTestId("store-sheet")).toBeNull();
  });

  test("a failed purchase shows its error in the sheet", async () => {
    purchase.mockRejectedValue(new Error("The store is unavailable."));
    const view = await render(<StoreScreen />);
    await waitFor(() => expect(view.getByTestId("store-pack-coins_small")).toBeTruthy());

    await fireEvent.press(view.getByTestId("store-pack-coins_small"));
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    await waitFor(() => expect(view.getByTestId("store-sheet-error").props.children).toBe("The store is unavailable."));
  });
});

describe("TILES", () => {
  async function tilesTab() {
    const view = await render(<StoreScreen />);
    await fireEvent.press(view.getByTestId("store-tab-tiles"));
    expect(view.getByTestId("store-tab-tiles").props.accessibilityState.selected).toBe(true);
    return view;
  }

  test("marks the equipped set IN USE, offers EQUIP for owned ones and a price for the rest", async () => {
    const view = await tilesTab();

    expect(view.getByTestId("store-tile-in-use-ivory")).toBeTruthy();
    expect(view.getByTestId("store-tile-equip-jade")).toBeTruthy();
    expect(view.getByTestId("store-tile-buy-midnight").props.accessibilityLabel).toBe("Buy Midnight tiles for 4,000 coins");
  });

  test("EQUIP equips at once and toasts it", async () => {
    const view = await tilesTab();

    await fireEvent.press(view.getByTestId("store-tile-equip-jade"));

    expect(tileSets.equip).toHaveBeenCalledWith("jade");
    expect(view.getByTestId("store-toast").props.children).toBe("JADE TILES EQUIPPED");
  });

  test("buys an affordable set through the sheet", async () => {
    const view = await tilesTab();

    await fireEvent.press(view.getByTestId("store-tile-buy-midnight"));
    expect(view.getByTestId("store-sheet-line").props.children).toBe("Costs 4,000 coins. You’ll have 1,000 left.");
    expect(view.getByTestId("store-sheet-confirm").props.accessibilityLabel).toBe("Buy for 4,000 coins");
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    await waitFor(() => expect(view.getByTestId("store-toast").props.children).toBe("MIDNIGHT TILES EQUIPPED"));
    expect(tileSets.buy).toHaveBeenCalledWith("midnight");
    expect(quests.refreshCoins).toHaveBeenCalled();
    expect(view.queryByTestId("store-sheet")).toBeNull();
  });

  test("a set the player can't afford says how short they are, and GET COINS opens COINS", async () => {
    quests = questsWith({ coins: 2775 });
    const view = await tilesTab();

    await fireEvent.press(view.getByTestId("store-tile-buy-midnight"));
    expect(view.getByTestId("store-sheet-line").props.children).toBe("You need 1,225 more coins.");
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    expect(tileSets.buy).not.toHaveBeenCalled();
    expect(view.queryByTestId("store-sheet")).toBeNull();
    expect(view.getByTestId("store-tab-coins").props.accessibilityState.selected).toBe(true);
  });

  test("a refused buy keeps the sheet open with the server's reason", async () => {
    jest.mocked(tileSets.buy).mockResolvedValue({ ok: false, reason: "not_owned", message: "Sign in to buy tile sets." });
    const view = await tilesTab();

    await fireEvent.press(view.getByTestId("store-tile-buy-rosewood"));
    await fireEvent.press(view.getByTestId("store-sheet-confirm"));

    await waitFor(() => expect(view.getByTestId("store-sheet-error").props.children).toBe("Sign in to buy tile sets."));
  });
});

describe("DAILY BONUS", () => {
  test("locks the card for an unverified player", async () => {
    signedIn(false);
    quests = questsWith({ state: streakState(2) });

    const view = await render(<StoreScreen />);

    expect(view.getByText("Verify your email to collect it.")).toBeTruthy();
  });

  test("shows today's reward as claimed with a countdown, then CLAIM on the next UTC day", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-11-05T23:59:58.000Z") });
    quests = questsWith({ state: streakState(2) });

    const view = await render(<StoreScreen />);

    expect(view.getByTestId("store-daily-claimed").props.accessibilityLabel).toBe("Claimed. Next bonus in 1 minute");
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    const claim = view.getByTestId("store-daily-claim");
    expect(claim.props.accessibilityLabel).toBe("Claim daily bonus, 100 coins");

    await fireEvent.press(claim);
    expect(quests.refresh).toHaveBeenCalled();

    quests = questsWith({ state: streakState(3), streakBanner: { day: 3, reward: 100 } });
    await view.rerender(<StoreScreen />);
    expect(view.getByTestId("store-toast").props.children).toBe("+100 DAILY BONUS");
    expect(quests.dismissStreakBanner).toHaveBeenCalled();
  });
});
