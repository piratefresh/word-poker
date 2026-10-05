/**
 * coin-offering.ts — the coin store's view of a RevenueCat Offering (STO-346).
 *
 * Shared by `revenuecat.ts` (the native SDK wrapper) and its web stub, so neither the store screen
 * nor its tests touch the SDK's own types. The Offering's metadata is dashboard-authored JSON, so it
 * is read defensively: anything that is not the expected shape is ignored, never trusted.
 */

/** The store cannot sell here: the web, or a build without the platform's RevenueCat key. */
export class StoreUnavailableError extends Error {
  constructor() {
    super("Coin packs are available in the mobile app.");
    this.name = "StoreUnavailableError";
  }
}

/** One pack the store can sell, as the platform's store prices it. */
export interface CoinPackage {
  /** The store product id (`coins_small`), which the catalog's grants are keyed by. */
  readonly productId: string;
  /** The store's own formatted price ("$0.99"); never formatted by the app. */
  readonly priceString: string;
  /** The price as a number, for comparing coins per price. */
  readonly price: number;
  /** The SDK's package, handed back to `purchaseCoinPack`; opaque outside `revenuecat.ts`. */
  readonly handle: unknown;
}

/** How a pack's row is dressed, from the Offering's metadata. */
export interface PackDisplay {
  readonly label?: string;
  readonly badge?: string;
}

export interface CoinOffering {
  readonly packages: readonly CoinPackage[];
  /** `{ packs: { [productId]: { label?, badge? } } }` from the Offering's metadata. */
  readonly display: Readonly<Record<string, PackDisplay>>;
}

export type PurchaseOutcome = "purchased" | "cancelled";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `{ packs: { [productId]: { label?, badge? } } }`, keeping only string fields. */
export function packDisplayFromMetadata(metadata: unknown): Record<string, PackDisplay> {
  if (!isRecord(metadata) || !isRecord(metadata.packs)) return {};
  const display: Record<string, PackDisplay> = {};

  for (const [productId, entry] of Object.entries(metadata.packs)) {
    if (!isRecord(entry)) continue;
    display[productId] = {
      ...(typeof entry.label === "string" && entry.label ? { label: entry.label } : {}),
      ...(typeof entry.badge === "string" && entry.badge ? { badge: entry.badge } : {}),
    };
  }

  return display;
}
