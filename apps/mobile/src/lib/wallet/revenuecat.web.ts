/**
 * revenuecat.web.ts — the web build's coin store, through RevenueCat Web Billing (STO-346).
 *
 * The same surface as `revenuecat.ts`, over `@revenuecat/purchases-js` instead of
 * `react-native-purchases`. The SDK is configured on first use and only in a browser: the web build
 * also renders statically in Node. The balance never comes from here either — `GET /api/wallet`
 * reads it on every platform.
 *
 * The web SDK has no anonymous `configure` or `logOut`: it starts on a generated anonymous id, and
 * `changeUser` moves it to the player and back.
 */

import { ErrorCode, Purchases, PurchasesError, type Package } from "@revenuecat/purchases-js";

import {
  StoreUnavailableError,
  packDisplayFromMetadata,
  type CoinOffering,
  type CoinPackage,
  type PurchaseOutcome,
} from "./coin-offering";

export { StoreUnavailableError } from "./coin-offering";

/** The Web Billing public key. Written out literally: Expo inlines only literal names. */
function apiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY || undefined;
}

let instance: Purchases | null = null;

/** Whether this build can sell: a browser, with the Web Billing key set. */
export function revenuecatAvailable(): boolean {
  return typeof window !== "undefined" && apiKey() !== undefined;
}

/** Configures the SDK once, on an anonymous id until `logInRevenueCat`. */
function purchases(): Purchases {
  const key = apiKey();
  if (!key || typeof window === "undefined") throw new StoreUnavailableError();

  instance ??= Purchases.configure({ apiKey: key, appUserId: Purchases.generateRevenueCatAnonymousAppUserId() });

  return instance;
}

export function configureRevenueCat(): void {
  purchases();
}

/** Ties the SDK's purchases to the Better Auth user id, which is also the Wallet's owner. */
export async function logInRevenueCat(userId: string): Promise<void> {
  await purchases().changeUser(userId);
}

/** Forgets the signed-out player, so the next one's purchases cannot land on their Wallet. */
export async function logOutRevenueCat(): Promise<void> {
  if (!instance) return;
  await instance.changeUser(Purchases.generateRevenueCatAnonymousAppUserId());
}

/** The current Offering's packages, priced by Web Billing, and how each row is dressed. */
export async function fetchCoinOffering(): Promise<CoinOffering> {
  const offerings = await purchases().getOfferings();
  const current = offerings.current;
  if (!current) return { packages: [], display: {} };

  const packages: CoinPackage[] = current.availablePackages.map((pkg) => ({
    productId: pkg.webBillingProduct.identifier,
    priceString: pkg.webBillingProduct.price.formattedPrice,
    price: pkg.webBillingProduct.price.amountMicros / 1_000_000,
    handle: pkg,
  }));

  return { packages, display: packDisplayFromMetadata(current.metadata) };
}

/** Buys one pack in RevenueCat's checkout. Closing the checkout is `"cancelled"`, not an error. */
export async function purchaseCoinPack(pack: CoinPackage): Promise<PurchaseOutcome> {
  const sdk = purchases();
  try {
    // The handle is the SDK package `fetchCoinOffering` put there; nothing else builds one.
    await sdk.purchase({ rcPackage: pack.handle as Package });

    return "purchased";
  } catch (error) {
    if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError) return "cancelled";
    throw error;
  }
}
