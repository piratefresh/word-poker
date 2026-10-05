/**
 * catalog.ts — which packs the store may show, and for how many coins (STO-346).
 *
 * The amounts are RevenueCat dashboard data (each product's grant), so the app never ships a coin
 * count. Only `COIN_PACK_IDS` pass: a product granting coins that the store does not sell stays out.
 */

import { COIN_PACK_IDS, isCoinPackId, type CoinCatalog } from "@wordpoker/contracts";

import { revenueCat, type RevenueCatClient } from "./revenuecat";

/** How long a fetched catalog is served before RevenueCat is asked again. */
export const CATALOG_TTL_MS = 10 * 60 * 1000;

let cached: { readonly at: number; readonly catalog: CoinCatalog } | undefined;

export interface CatalogDeps {
  readonly client?: RevenueCatClient;
  readonly now?: () => number;
}

/** The store's packs, smallest first, each with its grant. A failure is thrown and never cached. */
export async function coinCatalog(deps: CatalogDeps = {}): Promise<CoinCatalog> {
  const now = deps.now?.() ?? Date.now();
  if (cached && now - cached.at < CATALOG_TTL_MS) return cached.catalog;

  const grants = await (deps.client ?? revenueCat()).listCoinGrants();
  const coinsById = new Map(
    grants.filter((grant) => isCoinPackId(grant.storeProductId)).map((grant) => [grant.storeProductId, grant.coins]),
  );
  const catalog: CoinCatalog = {
    packs: COIN_PACK_IDS.flatMap((productId) => {
      const coins = coinsById.get(productId);

      return coins === undefined ? [] : [{ productId, coins }];
    }),
  };

  cached = { at: now, catalog };

  return catalog;
}

/** Forgets the cached catalog; for tests. */
export function clearCatalogCache(): void {
  cached = undefined;
}
