import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dealHand } from "../src/deal";
import { OfflineActionError } from "../src/errors";
import { LETTER_VALUES } from "../src/letters";
import { SWAP_LETTERS, isSwappedTileId, swapTile, swappedTileId, type SwapSource } from "../src/power-swap";

/**
 * §44's Swap a Private Tile family on its own: a power, a deal seed and a seat go in, and the
 * plain tile comes out. The hand's side of a swap — the window, the rack, the draft — is pinned
 * in `offline.test.ts`.
 */

const SEED = 20260919;
const PLAYERS = 4;
const VOWELS = ["A", "E", "I", "O", "U"];

/** A seat's swap source at a table of `PLAYERS`, with the bag its deal left behind. */
function source(dealSeed: number, seat: number): SwapSource {
  return { dealSeed, seat, restOfBag: () => dealHand({ seed: dealSeed, playerCount: PLAYERS }).rest };
}

describe("swapTile", () => {
  it("hands out a plain single-letter tile at §6's value, whichever power", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      for (const power of ["random_wild", "vowel_magnet", "mulligan"] as const) {
        const tile = swapTile(power, source(seed, seed % PLAYERS));

        assert.equal(tile.letter.length, 1);
        assert.equal(tile.points, LETTER_VALUES[tile.letter as keyof typeof LETTER_VALUES]);
        assert.ok(!("multiplier" in tile), "no multiplier");
        assert.ok(!("alternativeLetter" in tile), "never a choice tile");
      }
    }
  });

  it("draws Random Wild from every letter and Vowel Magnet from the vowels alone", () => {
    const wild = new Set<string>();
    const vowels = new Set<string>();
    for (let seed = 0; seed < 2_000; seed += 1) {
      wild.add(swapTile("random_wild", source(seed, 0)).letter);
      vowels.add(swapTile("vowel_magnet", source(seed, 0)).letter);
    }

    assert.equal(wild.size, 26, "every letter turns up");
    assert.deepEqual([...vowels].sort(), VOWELS);
    assert.deepEqual(SWAP_LETTERS.vowel_magnet, VOWELS);
  });

  it("fixes the letter by the deal seed and the seat", () => {
    assert.deepEqual(swapTile("random_wild", source(SEED, 2)), swapTile("random_wild", source(SEED, 2)));
    const seats = new Set(
      [0, 1, 2, 3, 4, 5].map((seat) => swapTile("random_wild", source(SEED, seat)).letter),
    );
    assert.ok(seats.size > 1, "each seat has a stream of its own");
  });

  it("rolls no letter from the bag, so it never asks for it", () => {
    const blind: SwapSource = {
      dealSeed: SEED,
      seat: 1,
      restOfBag: () => assert.fail("a rolled letter never reads the bag"),
    };

    assert.doesNotThrow(() => swapTile("random_wild", blind));
    assert.doesNotThrow(() => swapTile("vowel_magnet", blind));
  });

  it("names the new tile after the seat, never after its letter or a bag tile", () => {
    for (const power of ["vowel_magnet", "mulligan"] as const) {
      const tile = swapTile(power, source(SEED, 3));

      assert.equal(tile.id, swappedTileId(3));
      assert.doesNotMatch(tile.id, /^[A-Z]+-\d+$/, "not the shape of a bag or choice tile id");
    }
  });

  it("tells a swapped tile from every tile the deal makes", () => {
    const { privateTiles, community, rest } = dealHand({ seed: SEED, playerCount: PLAYERS });

    assert.ok(isSwappedTileId(swappedTileId(0)));
    assert.ok(isSwappedTileId(swapTile("random_wild", source(SEED, 5)).id));
    for (const tile of [...privateTiles.flat(), ...community, ...rest]) {
      assert.equal(isSwappedTileId(tile.id), false, tile.id);
    }
  });
});

describe("swapTile — Mulligan", () => {
  it("takes the letter of the seat's own tile in the rest of the bag", () => {
    const { rest } = dealHand({ seed: SEED, playerCount: PLAYERS });

    for (let seat = 0; seat < PLAYERS; seat += 1) {
      assert.equal(swapTile("mulligan", source(SEED, seat)).letter, rest[seat]?.letter, `seat ${seat}`);
    }
  });

  it("never gives two seats the same bag tile, and never a tile anyone was dealt", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const dealt = dealHand({ seed, playerCount: PLAYERS });
      const shown = new Set([...dealt.privateTiles.flat(), ...dealt.community].map((tile) => tile.id));
      const taken = dealt.rest.slice(0, PLAYERS);

      assert.equal(new Set(taken.map((tile) => tile.id)).size, PLAYERS, `seed ${seed}: distinct tiles`);
      for (const tile of taken) assert.ok(!shown.has(tile.id), `seed ${seed}: ${tile.id} was never dealt`);
    }
  });

  it("refuses when the bag has no tile left at the seat's index", () => {
    const empty: SwapSource = { dealSeed: SEED, seat: 0, restOfBag: () => [] };

    assert.throws(() => swapTile("mulligan", empty), OfflineActionError);
  });
});
