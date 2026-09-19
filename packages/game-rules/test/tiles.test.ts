import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import { NotEnoughTilesError, TILE_BAG_SIZE, createRng, createTileBag, draw } from "../src/index";

/**
 * The bag docs/FINAL_RULES.md pins, transcribed here in the other shape (`letter →
 * [copies, points]`) and in alphabetical order: a typo on either side shows up as a
 * mismatch instead of agreeing with itself.
 */
const PINNED_DISTRIBUTION: Readonly<Record<string, readonly [copies: number, points: number]>> = {
  A: [9, 1],
  B: [2, 4],
  C: [2, 4],
  D: [4, 3],
  E: [12, 1],
  F: [2, 5],
  G: [3, 3],
  H: [2, 5],
  I: [9, 1],
  J: [1, 8],
  K: [1, 5],
  L: [4, 2],
  M: [2, 4],
  N: [6, 2],
  O: [8, 1],
  P: [2, 4],
  Q: [1, 10],
  R: [6, 2],
  S: [4, 2],
  T: [6, 2],
  U: [4, 1],
  V: [2, 5],
  W: [2, 5],
  X: [1, 8],
  Y: [2, 5],
  Z: [1, 10],
};

/** The rules doc's point tiers, keyed by value — a second, independent reading of them. */
const PINNED_POINTS: Readonly<Record<number, string>> = {
  1: "AEIOU",
  2: "RSTLN",
  3: "DG",
  4: "BCMP",
  5: "FHVWYK",
  8: "JX",
  10: "QZ",
};

/**
 * The single-letter tiles of one letter, in bag order. Telling the two-letter tiles apart
 * is the point of naming this at all: the two choice tiles carry `letter` `A` and `T`, so
 * a plain `letter` filter would count them as another copy of those letters and quietly
 * make every count below wrong.
 */
function letterTiles(bag: readonly Tile[], letter: string): Tile[] {
  return bag.filter((tile) => tile.letter === letter && !("alternativeLetter" in tile));
}

describe("createTileBag", () => {
  it("matches the pinned distribution letter for letter", () => {
    const bag = createTileBag();

    assert.equal(TILE_BAG_SIZE, 100);
    assert.equal(bag.length, TILE_BAG_SIZE);

    let expectedSize = 0;
    for (const [letter, [copies, points]] of Object.entries(PINNED_DISTRIBUTION)) {
      const tiles = letterTiles(bag, letter);
      expectedSize += copies;

      assert.deepEqual(
        tiles.map((tile) => tile.id),
        Array.from({ length: copies }, (_, index) => `${letter}-${index + 1}`),
        `${letter} ids`,
      );
      assert.deepEqual(
        tiles.map((tile) => tile.points),
        Array.from({ length: copies }, () => points),
        `${letter} points`,
      );
    }
  });

  it("values every letter at the tier the rules doc lists", () => {
    const bag = createTileBag();

    for (const [points, letters] of Object.entries(PINNED_POINTS)) {
      for (const letter of letters) {
        const tiles = letterTiles(bag, letter);

        assert.ok(tiles.length > 0, `${letter} must be in the bag`);
        assert.deepEqual(
          [...new Set(tiles.map((tile) => tile.points))],
          [Number(points)],
          `${letter} is worth ${points}`,
        );
      }
    }
  });

  it("accounts for the whole bag in the table plus the two choice tiles", () => {
    const bag = createTileBag();
    const singleLetters = bag.filter((tile) => !("alternativeLetter" in tile));
    const choiceTiles = bag.filter((tile) => "alternativeLetter" in tile);
    const counted = Object.values(PINNED_DISTRIBUTION).reduce((total, [copies]) => total + copies, 0);

    assert.equal(counted, 98);
    assert.equal(singleLetters.length, counted);
    assert.equal(choiceTiles.length, 2);
    assert.equal(singleLetters.length + choiceTiles.length, TILE_BAG_SIZE);
  });

  it("ends the bag with the two two-letter choice tiles, each face valued", () => {
    assert.deepEqual(createTileBag().slice(-2), [
      { id: "AE-1", letter: "A", alternativeLetter: "E", points: 1, alternativePoints: 1 },
      { id: "TS-1", letter: "T", alternativeLetter: "S", points: 2, alternativePoints: 2 },
    ]);
  });

  it("gives every tile an id of its own", () => {
    const ids = createTileBag().map((tile) => tile.id);

    assert.equal(new Set(ids).size, TILE_BAG_SIZE);
  });

  it("builds a fresh bag each call, so no two tables share tile objects", () => {
    const first = createTileBag();
    const firstTile = first[0];
    assert.ok(firstTile !== undefined);

    firstTile.points = 99;
    first.pop();

    assert.equal(createTileBag()[0]?.points, 1);
    assert.equal(createTileBag().length, TILE_BAG_SIZE);
  });
});

describe("draw", () => {
  it("leaves the bag exactly as it found it", () => {
    const bag = createTileBag();
    const before = structuredClone(bag);

    const { drawn, rest } = draw(bag, 7, createRng(1));

    assert.deepEqual(bag, before);

    // The returned arrays are the caller's to keep: mutating them must not reach the bag.
    drawn.push(...rest);
    rest.length = 0;

    assert.deepEqual(bag, before);
  });

  it("replays the same draw for the same seed", () => {
    const first = draw(createTileBag(), 12, createRng(20260919));
    const second = draw(createTileBag(), 12, createRng(20260919));

    assert.deepEqual(first, second);
  });

  it("keeps the pinned pick order for a seed", () => {
    // Pinned the way the rng's sequence is: changing the sampler or the number of `rng`
    // calls it makes changes every draw for every existing seed, which is a deliberate
    // event rather than a refactor side effect.
    const { drawn } = draw(createTileBag(), 5, createRng(20260919));

    assert.deepEqual(drawn.map((tile) => tile.id), ["T-5", "I-4", "B-2", "U-1", "A-7"]);
  });

  it("takes a different set of tiles for different seeds", () => {
    const seeds = [0, 1, 2, 42, 123456789];
    const picks = seeds.map((seed) =>
      draw(createTileBag(), 4, createRng(seed))
        .drawn.map((tile) => tile.id)
        .join(","),
    );

    assert.equal(new Set(picks).size, seeds.length);
  });

  it("takes distinct tiles and hands back the remainder in the bag's own order", () => {
    const bag = createTileBag();
    const { drawn, rest } = draw(bag, 9, createRng(7));

    assert.equal(drawn.length, 9);
    assert.equal(rest.length, bag.length - 9);
    assert.equal(new Set(drawn.map((tile) => tile.id)).size, drawn.length);

    // `rest` is the bag minus what was taken, still in bag order — not the shuffled tail
    // the sampler happens to leave behind.
    const taken = new Set(drawn.map((tile) => tile.id));
    assert.deepEqual(rest, bag.filter((tile) => !taken.has(tile.id)));
  });

  it("draws a whole bag as a permutation of it", () => {
    const bag = createTileBag();
    const { drawn, rest } = draw(bag, bag.length, createRng(4));

    assert.deepEqual(rest, []);
    assert.deepEqual(
      drawn.map((tile) => tile.id).sort(),
      bag.map((tile) => tile.id).sort(),
    );
  });

  it("takes nothing, and changes nothing, when the count is zero", () => {
    const bag = createTileBag();
    const { drawn, rest } = draw(bag, 0, createRng(11));

    assert.deepEqual(drawn, []);
    assert.deepEqual(rest, bag);

    // The degenerate bag: nothing to take, and nothing to take it from.
    assert.deepEqual(draw([], 0, createRng(11)), { drawn: [], rest: [] });
  });

  it("refuses to overdraw, naming the request and what is left", () => {
    assert.throws(() => draw(createTileBag(), TILE_BAG_SIZE + 1, createRng(1)), NotEnoughTilesError);
    assert.throws(() => draw(createTileBag(), TILE_BAG_SIZE + 1, createRng(1)), /cannot draw 101 tiles/);
    assert.throws(() => draw(createTileBag(), TILE_BAG_SIZE + 1, createRng(1)), /holds 100/);

    // The limit is the bag in hand, not the size of a fresh bag: the rest of a deal is a
    // bag too, and asking it for one tile too many is the same mistake.
    const { rest } = draw(createTileBag(), 10, createRng(2));
    assert.throws(() => draw(rest, rest.length + 1, createRng(3)), /holds 90/);
  });

  it("rejects a count that is not a non-negative whole number", () => {
    for (const count of [-1, 1.5, Number.NaN]) {
      assert.throws(() => draw(createTileBag(), count, createRng(1)), RangeError, `count ${count}`);
    }
  });
});
