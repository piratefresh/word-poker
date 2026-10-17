/**
 * The store's rows: a pack needs both a store price and a catalog grant, and "Best Value" goes on
 * the most coins per unit of price.
 */

import type { CoinPackage } from "@/lib/wallet/coin-offering";

import { joinCoinPacks } from "./coin-packs";

const pkg = (productId: string, price: number): CoinPackage => ({
  productId,
  price,
  priceString: `$${price}`,
  handle: { productId },
});

const CATALOG = {
  packs: [
    { productId: "coins_small", coins: 2000 },
    { productId: "coins_medium", coins: 12000 },
    { productId: "coins_large", coins: 30000 },
  ],
};

describe("joinCoinPacks", () => {
  test("joins prices with grants, smallest first, and marks the best value", () => {
    const { rows, hidden } = joinCoinPacks(
      [pkg("coins_large", 9.99), pkg("coins_small", 0.99), pkg("coins_medium", 4.99)],
      CATALOG,
      { coins_small: { label: "Starter" } },
    );

    expect(hidden).toEqual([]);
    expect(rows.map((row) => [row.productId, row.coins, row.priceString, row.badge, row.label])).toEqual([
      ["coins_small", 2000, "$0.99", undefined, "Starter"],
      ["coins_medium", 12000, "$4.99", undefined, undefined],
      ["coins_large", 30000, "$9.99", "Best Value", undefined],
    ]);
  });

  test("hides a package the catalog has no grant for", () => {
    const { rows, hidden } = joinCoinPacks([pkg("coins_small", 0.99), pkg("coins_mystery", 1.99)], CATALOG, {});

    expect(rows.map((row) => row.productId)).toEqual(["coins_small"]);
    expect(hidden).toEqual(["coins_mystery"]);
  });

  test("moves a metadata 'Best Value' to the pack that earns it, and keeps other badges", () => {
    const { rows } = joinCoinPacks([pkg("coins_small", 0.99), pkg("coins_medium", 0.99)], CATALOG, {
      coins_small: { badge: "Best Value" },
      coins_medium: { badge: "Popular" },
    });

    expect(rows.map((row) => row.badge)).toEqual([undefined, "Best Value"]);
  });
});
