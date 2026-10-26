import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import { TILE_BAG_SIZE, fixedDeal, startHand } from "../src/index";
import { resolveSubmission } from "../src/words/building";
import { scoreWord } from "../src/words/scoring";
import { TEST_DICTIONARY } from "./fixtures";

const SEED = 20261026;
const COASTER = { hands: { 0: ["C", "A"] }, board: ["O", "S", "T", "E", "R"] };

const ids = (tiles: readonly Tile[]): string[] => tiles.map((tile) => tile.id);
const letters = (tiles: readonly Tile[]): string => tiles.map((tile) => tile.letter).join("");

describe("fixedDeal", () => {
  it("deals the authored tiles, and COASTER scores 13 + the 10-point Full Rack Bonus", () => {
    const deal = fixedDeal({ seed: SEED, playerCount: 2, spec: COASTER });
    assert.equal(letters(deal.privateTiles[0] ?? []), "CA");
    assert.equal(letters(deal.community), "OSTER");

    const available = [...(deal.privateTiles[0] ?? []), ...deal.community];
    const order = "COASTER".split("").map((letter) => available.find((tile) => tile.letter === letter)?.id ?? "");
    const resolved = resolveSubmission({ available, submission: { plays: order.map((tileId) => ({ tileId })) } });
    assert.ok(resolved.ok);
    assert.equal(scoreWord(resolved.tiles).total, 23);
  });

  it("accounts for every tile of the bag exactly once", () => {
    const deal = fixedDeal({ seed: SEED, playerCount: 4, spec: COASTER });
    const all = [...deal.privateTiles.flat(), ...deal.community, ...deal.rest];
    assert.equal(all.length, TILE_BAG_SIZE);
    assert.equal(new Set(ids(all)).size, TILE_BAG_SIZE);
    for (const hand of deal.privateTiles) assert.equal(hand.length, 2);
  });

  it("fills unnamed seats from the seed, the same way every time", () => {
    const one = fixedDeal({ seed: SEED, playerCount: 3, spec: COASTER });
    const two = fixedDeal({ seed: SEED, playerCount: 3, spec: COASTER });
    const other = fixedDeal({ seed: SEED + 1, playerCount: 3, spec: COASTER });
    assert.deepEqual(one, two);
    assert.notDeepEqual(ids(one.privateTiles.slice(1).flat()), ids(other.privateTiles.slice(1).flat()));
  });

  it("prints multipliers and choice tiles as written", () => {
    const deal = fixedDeal({ seed: SEED, playerCount: 2, spec: { board: ["R:2", "Q:3", "RN", "AE:2", "T"] } });
    const [r, q, er, ae, t] = deal.community;
    assert.equal(r?.multiplier, "double-letter");
    assert.equal(q?.multiplier, "triple-letter");
    assert.equal(er?.id, "RN-1");
    assert.equal(ae?.multiplier, "double-letter");
    assert.equal(t?.multiplier, undefined);
  });

  it("refuses a spec the rules cannot deal", () => {
    const refuse = (spec: Parameters<typeof fixedDeal>[0]["spec"], playerCount = 2) =>
      assert.throws(() => fixedDeal({ seed: SEED, playerCount, spec }), RangeError);
    refuse({ hands: { 0: ["C"] } }); // wrong hand size
    refuse({ board: ["O", "S", "T"] }); // wrong board size
    refuse({ hands: { 2: ["C", "A"] } }); // no such seat
    refuse({ board: ["O", "S", "T", "E", "r"] }); // not a tile
    refuse({ board: ["XY", "S", "T", "E", "R"] }); // not a §10 pair
    refuse({ board: ["Q", "Q", "T", "E", "R"] }); // one Q in the bag
    refuse({ board: ["RN", "RN", "T", "E", "R"] }); // same pair twice
    refuse({ hands: { 0: ["AE", "EI"] }, board: ["OU", "TS", "T", "E", "R"] }); // four choice tiles
  });
});

describe("startHand with a fixed deal", () => {
  it("plays the authored hand, the board still face down pre-flop", () => {
    const deal = fixedDeal({ seed: SEED, playerCount: 2, spec: COASTER });
    const state = startHand({ seed: SEED, players: ["hero", "jay"], nowMs: 0, dictionary: TEST_DICTIONARY, deal });
    assert.equal(letters(state.seats[0]?.privateTiles ?? []), "CA");
    assert.equal(letters(state.community), "OSTER");
    assert.equal(state.revealed, 0);
  });
});
