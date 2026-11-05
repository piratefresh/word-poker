/**
 * The store's tile sets (STO-1045): the ids, their prices, and the request and response the app
 * and `/api/tile-sets` exchange.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TILE_SET,
  TILE_SET_IDS,
  TILE_SET_PRICES,
  isTileSetId,
  isTileSetRequest,
  isTileSetsResponse,
} from "../src/index";

describe("tile sets", () => {
  it("lists each set once, the free default first", () => {
    assert.deepEqual(TILE_SET_IDS, ["ivory", "jade", "rosewood", "midnight", "neon-alley"]);
    assert.equal(new Set(TILE_SET_IDS).size, TILE_SET_IDS.length);
    assert.equal(TILE_SET_IDS[0], DEFAULT_TILE_SET);
    assert.equal(TILE_SET_PRICES[DEFAULT_TILE_SET], 0);
  });

  it("prices every set but the default above zero", () => {
    for (const id of TILE_SET_IDS) {
      if (id === DEFAULT_TILE_SET) continue;
      assert.ok(Number.isInteger(TILE_SET_PRICES[id]) && TILE_SET_PRICES[id] > 0, id);
    }
  });

  it("knows its own ids", () => {
    assert.ok(isTileSetId("midnight"));
    assert.ok(!isTileSetId("gold"));
    assert.ok(!isTileSetId(undefined));
  });

  it("accepts a buy or an equip of a known set, nothing else", () => {
    assert.ok(isTileSetRequest({ action: "buy", tileSet: "jade" }));
    assert.ok(isTileSetRequest({ action: "equip", tileSet: "ivory" }));
    assert.ok(!isTileSetRequest({ action: "sell", tileSet: "jade" }));
    assert.ok(!isTileSetRequest({ action: "buy", tileSet: "gold" }));
    assert.ok(!isTileSetRequest({ action: "buy" }));
    assert.ok(!isTileSetRequest(null));
  });

  it("accepts a response that owns the default and wears a known set", () => {
    assert.ok(isTileSetsResponse({ owned: ["ivory"], equipped: "ivory" }));
    assert.ok(isTileSetsResponse({ owned: ["ivory", "midnight"], equipped: "midnight", coins: 4775 }));
    assert.ok(!isTileSetsResponse({ owned: ["midnight"], equipped: "midnight" }), "default missing");
    assert.ok(!isTileSetsResponse({ owned: ["ivory"], equipped: "gold" }));
    assert.ok(!isTileSetsResponse({ owned: ["ivory"], equipped: "ivory", coins: -1 }));
    assert.ok(!isTileSetsResponse({ owned: "ivory", equipped: "ivory" }));
  });
});
