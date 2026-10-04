/**
 * revenuecat.web.ts — the web build's coin store: it sells nothing (STO-346).
 *
 * Purchases are mobile-only for now, so the web bundle never loads `react-native-purchases`. The
 * balance still shows on the web: it comes from `GET /api/wallet`, not from the SDK.
 */

import { StoreUnavailableError, type CoinOffering, type CoinPackage, type PurchaseOutcome } from "./coin-offering";

export { StoreUnavailableError } from "./coin-offering";

export function revenuecatAvailable(): boolean {
  return false;
}

export function configureRevenueCat(): void {
  throw new StoreUnavailableError();
}

export async function logInRevenueCat(_userId: string): Promise<void> {
  throw new StoreUnavailableError();
}

export async function logOutRevenueCat(): Promise<void> {}

export async function fetchCoinOffering(): Promise<CoinOffering> {
  throw new StoreUnavailableError();
}

export async function purchaseCoinPack(_pack: CoinPackage): Promise<PurchaseOutcome> {
  throw new StoreUnavailableError();
}
