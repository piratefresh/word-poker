/**
 * The Wallet's vocabulary: pack ids, wallet_event kinds and the two response shapes the app reads
 * from the API routes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COIN_CURRENCY,
  COIN_PACK_IDS,
  WALLET_EVENT_KINDS,
  WELCOME_GRANT,
  isCoinCatalog,
  isCoinPackId,
  isWalletEventKind,
  isWalletResponse,
} from "../src/index";

describe("coin vocabulary", () => {
  it("names the currency and the welcome grant", () => {
    assert.equal(COIN_CURRENCY, "COIN");
    assert.equal(WELCOME_GRANT, 5000);
  });

  it("lists each pack once, smallest first", () => {
    assert.deepEqual(COIN_PACK_IDS, ["coins_small", "coins_medium", "coins_large"]);
    assert.equal(new Set(COIN_PACK_IDS).size, COIN_PACK_IDS.length);
    assert.ok(isCoinPackId("coins_medium"));
    assert.ok(!isCoinPackId("coins_huge"));
  });

  it("records exactly the economy's event kinds", () => {
    assert.deepEqual(WALLET_EVENT_KINDS, [
      "welcome",
      "purchase",
      "refund",
      "adjustment",
      "buy_in",
      "cash_out",
      "quest",
      "streak",
    ]);
    assert.ok(isWalletEventKind("buy_in"));
    assert.ok(!isWalletEventKind("gift"));
  });
});

describe("isWalletResponse", () => {
  it("accepts a whole, non-negative balance", () => {
    assert.ok(isWalletResponse({ coins: 0, welcomed: false }));
    assert.ok(isWalletResponse({ coins: 12_000, welcomed: true }));
  });

  it("refuses anything else", () => {
    for (const value of [
      null,
      {},
      { coins: 5000 },
      { coins: 5000, welcomed: "yes" },
      { coins: -1, welcomed: true },
      { coins: 1.5, welcomed: true },
      { coins: "5000", welcomed: true },
      5000,
    ]) {
      assert.ok(!isWalletResponse(value), JSON.stringify(value));
    }
  });
});

describe("isCoinCatalog", () => {
  it("accepts packs with a product id and a positive grant", () => {
    assert.ok(isCoinCatalog({ packs: [] }));
    assert.ok(isCoinCatalog({ packs: [{ productId: "coins_small", coins: 2000 }] }));
  });

  it("refuses a pack without a grant or an id", () => {
    for (const value of [
      null,
      {},
      { packs: {} },
      { packs: [{ productId: "coins_small", coins: 0 }] },
      { packs: [{ productId: "", coins: 2000 }] },
      { packs: [{ coins: 2000 }] },
    ]) {
      assert.ok(!isCoinCatalog(value), JSON.stringify(value));
    }
  });
});
