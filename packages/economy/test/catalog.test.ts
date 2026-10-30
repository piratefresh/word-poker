/**
 * The store's catalog: only the packs it sells, in pack order, cached for ten minutes.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { CATALOG_TTL_MS, clearCatalogCache, coinCatalog, type CoinGrant, type RevenueCatClient } from "../src/index";

function grantsClient(grants: CoinGrant[] | Error) {
  let calls = 0;
  const client: RevenueCatClient = {
    getCoinBalance: async () => 0,
    adjustCoins: async () => 0,
    deleteCustomer: async () => {},
    listCoinGrants: async () => {
      calls += 1;
      if (grants instanceof Error) throw grants;
      return grants;
    },
  };

  return { client, calls: () => calls };
}

describe("coinCatalog", () => {
  beforeEach(() => clearCatalogCache());

  it("keeps the store's packs, smallest first, and drops anything else", async () => {
    const { client } = grantsClient([
      { storeProductId: "coins_large", coins: 30000 },
      { storeProductId: "gems_pack", coins: 5 },
      { storeProductId: "coins_small", coins: 2000 },
    ]);

    assert.deepEqual(await coinCatalog({ client, now: () => 0 }), {
      packs: [
        { productId: "coins_small", coins: 2000 },
        { productId: "coins_large", coins: 30000 },
      ],
    });
  });

  it("serves the cached catalog for ten minutes, then asks again", async () => {
    const { client, calls } = grantsClient([{ storeProductId: "coins_small", coins: 2000 }]);

    await coinCatalog({ client, now: () => 0 });
    await coinCatalog({ client, now: () => CATALOG_TTL_MS - 1 });
    assert.equal(calls(), 1);

    await coinCatalog({ client, now: () => CATALOG_TTL_MS });
    assert.equal(calls(), 2);
  });

  it("throws a failure and does not cache it", async () => {
    const failing = grantsClient(new Error("down"));
    await assert.rejects(coinCatalog({ client: failing.client, now: () => 0 }));

    const { client, calls } = grantsClient([]);
    assert.deepEqual(await coinCatalog({ client, now: () => 1 }), { packs: [] });
    assert.equal(calls(), 1);
  });
});
