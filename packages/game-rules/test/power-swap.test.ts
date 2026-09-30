import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OfflineActionError } from "../src/errors";
import { LETTER_VALUES } from "../src/letters";
import { SWAP_LETTERS, swapTile, swappedTileId } from "../src/power-swap";

/**
 * §44's Swap a Private Tile family on its own: a power, a deal seed and a seat go in, and the
 * plain tile comes out. The hand's side of a swap — the window, the rack, the draft — is pinned
 * in `offline.test.ts`.
 */

const SEED = 20260919;
const VOWELS = ["A", "E", "I", "O", "U"];

describe("swapTile", () => {
  it("hands out a plain single-letter tile at §6's value", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const tile = swapTile("random_wild", { dealSeed: seed, seat: seed % 6 });

      assert.equal(tile.letter.length, 1);
      assert.equal(tile.points, LETTER_VALUES[tile.letter as keyof typeof LETTER_VALUES]);
      assert.ok(!("multiplier" in tile), "no multiplier");
      assert.ok(!("alternativeLetter" in tile), "never a choice tile");
    }
  });

  it("draws Random Wild from every letter and Vowel Magnet from the vowels alone", () => {
    const wild = new Set<string>();
    const vowels = new Set<string>();
    for (let seed = 0; seed < 2_000; seed += 1) {
      wild.add(swapTile("random_wild", { dealSeed: seed, seat: 0 }).letter);
      vowels.add(swapTile("vowel_magnet", { dealSeed: seed, seat: 0 }).letter);
    }

    assert.equal(wild.size, 26, "every letter turns up");
    assert.deepEqual([...vowels].sort(), VOWELS);
    assert.deepEqual(SWAP_LETTERS.vowel_magnet, VOWELS);
  });

  it("fixes the letter by the deal seed and the seat", () => {
    const source = { dealSeed: SEED, seat: 2 };

    assert.deepEqual(swapTile("random_wild", source), swapTile("random_wild", source));
    const seats = new Set(
      [0, 1, 2, 3, 4, 5].map((seat) => swapTile("random_wild", { dealSeed: SEED, seat }).letter),
    );
    assert.ok(seats.size > 1, "each seat has a stream of its own");
  });

  it("names the new tile after the seat, never after its letter or a bag tile", () => {
    const tile = swapTile("vowel_magnet", { dealSeed: SEED, seat: 3 });

    assert.equal(tile.id, swappedTileId(3));
    assert.doesNotMatch(tile.id, /^[A-Z]+-\d+$/, "not the shape of a bag or choice tile id");
  });

  it("deals no letter for Mulligan, which draws from the bag instead", () => {
    assert.throws(() => swapTile("mulligan", { dealSeed: SEED, seat: 0 }), OfflineActionError);
  });
});
