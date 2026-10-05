/**
 * revenuecat.ts — the only module that touches `react-native-purchases` (STO-346).
 *
 * Purchases need a development build; Expo Go runs the SDK's preview mode. The web build gets
 * `revenuecat.web.ts` instead, which sells nothing and keeps the SDK out of the web bundle.
 *
 * The balance is never read here: the Wallet is RevenueCat Virtual Currency, read on every
 * platform through `GET /api/wallet`, so a purchase only has to finish and the server says the rest.
 */

import { Platform } from "react-native";
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesError, type PurchasesPackage } from "react-native-purchases";

import {
  StoreUnavailableError,
  packDisplayFromMetadata,
  type CoinOffering,
  type CoinPackage,
  type PurchaseOutcome,
} from "./coin-offering";

export { StoreUnavailableError } from "./coin-offering";

/** The platform's public SDK key. Written out literally: Expo inlines only literal names. */
function apiKey(): string | undefined {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || undefined;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || undefined;

  return undefined;
}

let configured = false;

/** Whether this build can sell: iOS or Android, with that platform's key set. */
export function revenuecatAvailable(): boolean {
  return apiKey() !== undefined;
}

/** Configures the SDK once; later calls do nothing. */
export function configureRevenueCat(): void {
  const key = apiKey();
  if (!key) throw new StoreUnavailableError();
  if (configured) return;

  Purchases.configure({ apiKey: key });
  configured = true;
}

/** Ties the SDK's purchases to the Better Auth user id, which is also the Wallet's owner. */
export async function logInRevenueCat(userId: string): Promise<void> {
  configureRevenueCat();
  await Purchases.logIn(userId);
}

/** Forgets the signed-out player, so the next one's purchases cannot land on their Wallet. */
export async function logOutRevenueCat(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut();
}

/** The current Offering's packages, priced by the store, and how each row is dressed. */
export async function fetchCoinOffering(): Promise<CoinOffering> {
  configureRevenueCat();
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return { packages: [], display: {} };

  const packages: CoinPackage[] = current.availablePackages.map((pkg) => ({
    productId: pkg.product.identifier,
    priceString: pkg.product.priceString,
    price: pkg.product.price,
    handle: pkg,
  }));

  return { packages, display: packDisplayFromMetadata(current.metadata) };
}

function isCancellation(error: unknown): boolean {
  const code = (error as Partial<PurchasesError> | null)?.code;

  return code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/** Buys one pack. A player who backs out of the store's sheet is `"cancelled"`, not an error. */
export async function purchaseCoinPack(pack: CoinPackage): Promise<PurchaseOutcome> {
  configureRevenueCat();
  try {
    // The handle is the SDK package `fetchCoinOffering` put there; nothing else builds one.
    await Purchases.purchasePackage(pack.handle as PurchasesPackage);

    return "purchased";
  } catch (error) {
    if (isCancellation(error)) return "cancelled";
    throw error;
  }
}
