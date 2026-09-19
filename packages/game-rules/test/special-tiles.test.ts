import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LetterMultiplier, SequenceTile, Tile } from "@wordpoker/contracts";

import {
  COMMUNITY_TILE_COUNT,
  DEFAULT_SPECIAL_TILES,
  LETTER_VALUES,
  NO_SPECIAL_TILES,
  PRIVATE_TILES_PER_PLAYER,
  TILE_BAG_SIZE,
  TWO_LETTER_TILE_LIMIT,
  applySpecialTiles,
  createTileBag,
  dealHand,
  resolveSubmission,
  scoreWord,
  type Letter,
  type SpecialTilesConfig,
} from "../src/index";

/** A generator that hands back exactly the rolls a test scripted, and says how many it read. */
function scriptedRng(rolls: readonly number[]): { rng: () => number; calls: () => number } {
  let next = 0;
  return {
    rng: () => {
      const roll = rolls[next];
      if (roll === undefined) {
        throw new RangeError(`the rng was asked for roll ${next + 1} of ${rolls.length}`);
      }
      next += 1;
      return roll;
    },
    calls: () => next,
  };
}

/** §6's value for a letter, in the table the tests compare against. */
function pointsOf(letter: string): number {
  return LETTER_VALUES[letter as Letter];
}

/** A single-letter tile as the bag prints it. */
function letterTile(letter: string, copy: number): Tile {
  return { id: `${letter}-${copy}`, letter, points: pointsOf(letter) };
}

/** Two private tiles per seat and five community tiles, all single letters, in deal order. */
function spread(playerCount: number): { privateTiles: Tile[][]; community: Tile[] } {
  let next = 0;
  const tile = (): Tile => {
    const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[next % 26] ?? "A";
    next += 1;
    return letterTile(letter, next);
  };

  return {
    privateTiles: Array.from({ length: playerCount }, () =>
      Array.from({ length: PRIVATE_TILES_PER_PLAYER }, tile),
    ),
    community: Array.from({ length: COMMUNITY_TILE_COUNT }, tile),
  };
}

/** A table whose only specials are the sequence tiles it places: no multipliers. */
function placing(targets: SpecialTilesConfig["twoLetterTargets"], pairs: SpecialTilesConfig["sequencePairs"]): SpecialTilesConfig {
  return {
    sequencePairs: pairs,
    twoLetterTargets: targets,
    doubleLetterChance: 0,
    tripleLetterChance: 0,
    highValueDoubleBonus: 0,
  };
}

/** §10's cap counts both kinds, so this is the number the rules constrain. */
function twoLetterTiles(tiles: readonly Tile[]): Tile[] {
  return tiles.filter((tile) => "alternativeLetter" in tile || "sequenceLetter" in tile);
}

/** Whether the tile came out of the special-tile pass rather than the printed set. */
function isSpecial(tile: Tile): boolean {
  return "sequenceLetter" in tile || tile.multiplier !== undefined;
}

describe("applySpecialTiles", () => {
  it("places the first sequence tile in a seat's hand, the second on the board, the third wherever is open", () => {
    const dealt = spread(2);
    const { privateTiles, community } = dealt;
    const config = placing([[3, 1]], DEFAULT_SPECIAL_TILES.sequencePairs);
    const { rng, calls } = scriptedRng([0, 0, 0, 0, 0, 0, 0, ...Array.from({ length: 9 }, () => 0.99)]);

    const result = applySpecialTiles({ privateTiles, community, rng, config });

    // §10's recommendation, read in order: private seat 0's first tile, community tile 0,
    // then the first slot still open — seat 0's second tile.
    assert.deepEqual(result.privateTiles[0]?.[0], {
      id: "TH-seq-1",
      letter: "T",
      points: pointsOf("T"),
      sequenceLetter: "H",
      sequencePoints: pointsOf("H"),
    });
    assert.equal(result.privateTiles[0]?.[1]?.id, "IN-seq-1");
    assert.equal(result.community[0]?.id, "ER-seq-1");
    assert.deepEqual(result.privateTiles[1], privateTiles[1]);
    assert.deepEqual(result.community.slice(1), community.slice(1));

    // Each placement hands the tile it replaced back, in placement order.
    assert.deepEqual(result.displaced, [privateTiles[0]?.[0], community[0], privateTiles[0]?.[1]]);

    // One roll for the hand's target, two per placed tile, one per dealt tile for §9.
    assert.equal(calls(), 1 + 3 * 2 + 9);
    // The deal it was handed is untouched: the arrays are copies.
    assert.deepEqual(privateTiles, dealt.privateTiles);
    assert.deepEqual(community, dealt.community);
  });

  it("counts the choice tiles the shuffle dealt against §10's three", () => {
    const bag = createTileBag();
    const choices = bag.filter((tile) => "alternativeLetter" in tile);
    const board = spread(1).community;
    const config = placing([[3, 1]], DEFAULT_SPECIAL_TILES.sequencePairs);
    const { rng, calls } = scriptedRng([0, 0, 0, ...Array.from({ length: 7 }, () => 0.99)]);

    const result = applySpecialTiles({
      privateTiles: [choices],
      community: board,
      rng,
      config,
    });

    // Two choice tiles are already §10's two two-letter tiles, so the hand takes one more —
    // and it cannot come from the seat, whose slots are both taken, so it lands on the board.
    const placed = [...result.privateTiles.flat(), ...result.community].filter(isSpecial);
    assert.equal(placed.length, 1);
    assert.equal(result.community[0]?.id, "TH-seq-1");
    assert.equal(twoLetterTiles([...result.privateTiles.flat(), ...result.community]).length, TWO_LETTER_TILE_LIMIT);
    assert.deepEqual(result.displaced, [board[0]]);
    assert.equal(calls(), 1 + 2 + 7);
  });

  it("places nothing once the hand already holds three two-letter tiles", () => {
    const bag = createTileBag();
    const choices = bag.filter((tile) => "alternativeLetter" in tile);
    const sequence: Tile = { id: "TH-seq-1", letter: "T", points: pointsOf("T"), sequenceLetter: "H", sequencePoints: pointsOf("H") };
    const board = [sequence, ...spread(1).community.slice(1)];
    const config = placing([[3, 1]], DEFAULT_SPECIAL_TILES.sequencePairs);
    const { rng, calls } = scriptedRng([0, ...Array.from({ length: 7 }, () => 0.99)]);

    const result = applySpecialTiles({ privateTiles: [choices], community: board, rng, config });

    assert.deepEqual(result, { privateTiles: [choices], community: board, displaced: [] });
    // The target roll still happens — it is part of the documented stream — and nothing else.
    assert.equal(calls(), 1 + 7);
  });

  it("never places more pairs than the pool holds, and never the same pair twice", () => {
    const dealt = spread(1);
    const config = placing([[3, 1]], [
      ["T", "H"],
      ["E", "R"],
    ]);
    const { rng } = scriptedRng([0, 0, 0, 0, 0, ...Array.from({ length: 7 }, () => 0.99)]);

    const result = applySpecialTiles({ ...dealt, rng, config });

    const placed = [...result.privateTiles.flat(), ...result.community].filter(
      (tile): tile is SequenceTile => "sequenceLetter" in tile,
    );
    assert.deepEqual(
      placed.map((tile) => `${tile.letter}${tile.sequenceLetter}`),
      ["TH", "ER"],
    );
  });

  it("rolls one multiplier per dealt tile, with the triple band inside the double one", () => {
    const dealt = spread(1);
    const config: SpecialTilesConfig = {
      sequencePairs: [],
      twoLetterTargets: [],
      doubleLetterChance: 0.15,
      tripleLetterChance: 0.03,
      highValueDoubleBonus: 0,
    };
    // Boundaries: 0.029 is inside the triple band, 0.03 is not; 0.179 is inside the double
    // band, 0.18 — the sum of the two chances — is not.
    const { rng, calls } = scriptedRng([0, 0.029, 0.03, 0.179, 0.18, 0.99, 0.5]);

    const result = applySpecialTiles({ ...dealt, rng, config });

    const dealtTiles = [...result.privateTiles.flat(), ...result.community];
    assert.deepEqual(
      dealtTiles.map((tile) => tile.multiplier ?? null),
      ["triple-letter", "triple-letter", "double-letter", "double-letter", null, null, null],
    );
    assert.equal(calls(), 7);
  });

  it("gives a high-value letter its extra double chance, whatever face carries it", () => {
    const dealt = spread(1);
    const board = [dealt.community[0], dealt.community[1], dealt.community[2], dealt.community[3], dealt.community[4]] as Tile[];
    // J (8) and a Z-carrying sequence tile are §6's high-value tiers; A is not. Every tile
    // rolls the same 0.2, which only lands inside the widened double band.
    board[0] = letterTile("J", 1);
    board[1] = { id: "ZA-1", letter: "Z", points: pointsOf("Z"), sequenceLetter: "A", sequencePoints: pointsOf("A") };
    board[2] = letterTile("A", 2);
    const config: SpecialTilesConfig = {
      sequencePairs: [],
      twoLetterTargets: [],
      doubleLetterChance: 0.15,
      tripleLetterChance: 0.03,
      highValueDoubleBonus: 0.05,
    };
    const { rng } = scriptedRng([0.99, 0.99, 0.2, 0.2, 0.2, 0.99, 0.99]);

    const result = applySpecialTiles({ privateTiles: spread(1).privateTiles, community: board, rng, config });

    assert.equal(result.community[0]?.multiplier, "double-letter");
    assert.equal(result.community[1]?.multiplier, "double-letter");
    assert.equal(result.community[2]?.multiplier, undefined);
  });

  it("refuses a configuration a table cannot play", () => {
    const dealt = spread(1);
    const { rng } = scriptedRng([]);
    const bad: readonly (readonly [string, SpecialTilesConfig])[] = [
      ["a lowercase pair", placing([[2, 1]], [["t", "h"]])],
      ["a pair of two letters", placing([[2, 1]], [["T", "HH"]])],
      ["a target without a weight", placing([[2, 0]], DEFAULT_SPECIAL_TILES.sequencePairs)],
      ["a target of half a tile", placing([[1.5, 1]], DEFAULT_SPECIAL_TILES.sequencePairs)],
      ["a chance above one", { ...placing([[2, 1]], []), doubleLetterChance: 1.2 }],
      ["a negative chance", { ...placing([[2, 1]], []), tripleLetterChance: -0.1 }],
    ];

    for (const [name, config] of bad) {
      assert.throws(() => applySpecialTiles({ ...dealt, rng, config }), RangeError, name);
    }
  });
});

describe("dealHand with the table's special tiles", () => {
  const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

  it("deals the printed set, and nothing else, on a table that plays no specials", () => {
    for (const seed of SEEDS) {
      const { privateTiles, community, rest } = dealHand({ seed, playerCount: 2, specialTiles: NO_SPECIAL_TILES });
      const dealt = [...privateTiles.flat(), ...community];

      assert.ok(dealt.every((tile) => !isSpecial(tile)), `seed ${seed} dealt a special tile`);
      assert.equal(rest.length, TILE_BAG_SIZE - dealt.length);
      assert.equal(new Set([...dealt, ...rest].map((tile) => tile.id)).size, TILE_BAG_SIZE);
    }
  });

  it("replays the same complete deal for the same seed and configuration", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      assert.deepEqual(dealHand({ seed, playerCount: 3 }), dealHand({ seed, playerCount: 3 }));
      assert.notDeepEqual(
        dealHand({ seed, playerCount: 3 }).community,
        dealHand({ seed: seed + 1000, playerCount: 3 }).community,
      );
    }

    assert.notDeepEqual(
      dealHand({ seed: 7, playerCount: 3 }),
      dealHand({ seed: 7, playerCount: 3, specialTiles: NO_SPECIAL_TILES }),
    );
  });

  it("holds §10's cap across many hands, and accounts for every tile", () => {
    const playerCounts = [1, 2, 6, 9];
    let withSequence = 0;
    let withMultiplier = 0;

    for (const playerCount of playerCounts) {
      for (const seed of SEEDS) {
        const { privateTiles, community, rest } = dealHand({ seed, playerCount });
        const dealt = [...privateTiles.flat(), ...community];
        const placed = dealt.filter((tile): tile is SequenceTile => "sequenceLetter" in tile);

        assert.equal(privateTiles.length, playerCount);
        assert.ok(privateTiles.every((hand) => hand.length === PRIVATE_TILES_PER_PLAYER));
        assert.equal(community.length, COMMUNITY_TILE_COUNT);
        assert.ok(
          twoLetterTiles(dealt).length <= TWO_LETTER_TILE_LIMIT,
          `seed ${seed} with ${playerCount} seats dealt ${twoLetterTiles(dealt).length} two-letter tiles`,
        );

        for (const tile of placed) {
          assert.equal(tile.points, pointsOf(tile.letter), `seed ${seed}: ${tile.id} misprints its first value`);
          assert.equal(
            tile.sequencePoints,
            pointsOf(tile.sequenceLetter),
            `seed ${seed}: ${tile.id} misprints its second value`,
          );
        }

        if (placed.length > 0) {
          withSequence += 1;
        }
        if (dealt.some((tile) => tile.multiplier !== undefined)) {
          withMultiplier += 1;
        }

        // The bag is conserved: every printed tile is either on the table or in the deck,
        // and each placed sequence tile sits on the table exactly once.
        const ids = [...dealt, ...rest].map((tile) => tile.id);
        assert.equal(new Set(ids).size, ids.length, `seed ${seed} dealt a tile twice`);
        assert.equal(rest.length, TILE_BAG_SIZE - dealt.length + placed.length);
        const bagIds = new Set(createTileBag().map((tile) => tile.id));
        const printed = [...dealt.filter((tile) => bagIds.has(tile.id)), ...rest].map((tile) => tile.id);
        assert.deepEqual(printed.sort(), [...bagIds].sort());
      }
    }

    assert.ok(withSequence > 0, "no hand in the sample placed a sequence tile");
    assert.ok(withMultiplier > 0, "no hand in the sample carried a multiplier");
  });

  it("makes both multiplier kinds reachable, and multiplies the letters they print", () => {
    const kinds = new Map<LetterMultiplier, number>();
    let sample: { tile: Tile; available: Tile[] } | undefined;

    for (const seed of SEEDS) {
      const { privateTiles, community } = dealHand({ seed, playerCount: 2 });

      for (const hand of privateTiles) {
        const available = [...hand, ...community];
        for (const tile of available) {
          if (tile.multiplier === undefined) {
            continue;
          }
          kinds.set(tile.multiplier, (kinds.get(tile.multiplier) ?? 0) + 1);
          sample ??= { tile, available };
        }
      }
    }

    assert.ok((kinds.get("double-letter") ?? 0) > 0, "no Double Letter tile in the sample");
    assert.ok((kinds.get("triple-letter") ?? 0) > 0, "no Triple Letter tile in the sample");

    const { tile, available } = sample ?? {};
    assert.ok(tile !== undefined && available !== undefined);
    const plain = available.find(
      (other) => other.id !== tile.id && !("alternativeLetter" in other) && !("sequenceLetter" in other),
    );
    assert.ok(plain !== undefined);

    const resolution = resolveSubmission({
      available,
      submission: { plays: [{ tileId: tile.id }, { tileId: plain.id }] },
    });
    assert.ok(resolution.ok);

    // §7: the multiplier rides on the tile and reaches the score, while the plain tile's
    // letter is worth exactly §6's value.
    const factor: Record<LetterMultiplier, number> = { "double-letter": 2, "triple-letter": 3 };
    const score = scoreWord(resolution.tiles);
    const expected = pointsOf(tile.letter) * factor[tile.multiplier ?? "double-letter"] + pointsOf(plain.letter);

    assert.equal(score.total, expected);
    assert.equal(score.letters[0]?.multiplier, tile.multiplier);
  });
});
