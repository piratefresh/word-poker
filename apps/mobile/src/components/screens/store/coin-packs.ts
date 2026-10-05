/**
 * coin-packs.ts — the store's rows: the Offering's packages joined with the catalog (STO-346).
 *
 * The store prices a pack and RevenueCat's grant counts its coins; a row needs both. A package the
 * catalog has no grant for is hidden — never shown with a guessed amount. "Best Value" goes on the
 * pack with the most coins per unit of price, whatever the metadata says.
 */

import type { CoinCatalog } from "@wordpoker/contracts";

import type { CoinPackage, PackDisplay } from "@/lib/coin-offering";

export const BEST_VALUE = "Best Value";

export interface CoinPackRow {
  readonly productId: string;
  readonly coins: number;
  readonly priceString: string;
  readonly label?: string;
  readonly badge?: string;
  readonly pack: CoinPackage;
}

export interface JoinedPacks {
  readonly rows: readonly CoinPackRow[];
  /** Product ids the Offering sells but the catalog has no grant for. */
  readonly hidden: readonly string[];
}

export function joinCoinPacks(
  packages: readonly CoinPackage[],
  catalog: CoinCatalog,
  display: Readonly<Record<string, PackDisplay>>,
): JoinedPacks {
  const coinsById = new Map(catalog.packs.map((pack) => [pack.productId, pack.coins]));
  const hidden: string[] = [];
  const priced: { pack: CoinPackage; coins: number }[] = [];

  for (const pack of packages) {
    const coins = coinsById.get(pack.productId);
    if (coins === undefined) hidden.push(pack.productId);
    else priced.push({ pack, coins });
  }

  // Smallest first, as the catalog lists them.
  priced.sort((a, b) => a.coins - b.coins);

  const best =
    priced.length > 1
      ? priced.reduce((top, entry) => (entry.coins / entry.pack.price > top.coins / top.pack.price ? entry : top))
      : undefined;

  const rows = priced.map(({ pack, coins }): CoinPackRow => {
    const dressed = display[pack.productId] ?? {};
    const badge = pack === best?.pack ? BEST_VALUE : dressed.badge === BEST_VALUE ? undefined : dressed.badge;

    return {
      productId: pack.productId,
      coins,
      priceString: pack.priceString,
      ...(dressed.label ? { label: dressed.label } : {}),
      ...(badge ? { badge } : {}),
      pack,
    };
  });

  return { rows, hidden };
}
