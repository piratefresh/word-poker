import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import {
  COMMUNITY_TILE_COUNT,
  NO_SPECIAL_TILES,
  NotEnoughTilesError,
  PRIVATE_TILES_PER_PLAYER,
  TILE_BAG_SIZE,
  createRng,
  createTileBag,
  dealHand,
  shuffle,
} from "../src/index";

/** Ids of a list of tiles, in the order given — the shape most of these assertions compare. */
function ids(tiles: readonly Tile[]): string[] {
  return tiles.map((tile) => tile.id);
}

const SEED = 20260919;

describe("shuffle", () => {
  it("leaves the bag it was given untouched", () => {
    const bag = createTileBag();
    const before = structuredClone(bag);

    const shuffled = shuffle(bag, createRng(SEED));

    assert.deepEqual(bag, before);

    // The result is the caller's own array: changing it must not reach the input.
    shuffled.reverse();
    shuffled.pop();

    assert.deepEqual(bag, before);
  });

  it("replays the same order for the same seed", () => {
    assert.deepEqual(
      shuffle(createTileBag(), createRng(SEED)),
      shuffle(createTileBag(), createRng(SEED)),
    );
  });

  it("reorders the bag instead of handing it back as it was", () => {
    const bag = createTileBag();

    assert.notDeepEqual(ids(shuffle(bag, createRng(SEED))), ids(bag));
  });

  it("orders a bag differently for different seeds", () => {
    const seeds = [0, 1, 2, 42, 123456789];
    const orders = seeds.map((seed) => ids(shuffle(createTileBag(), createRng(seed))).join(","));

    assert.equal(new Set(orders).size, seeds.length);
  });

  it("keeps exactly the tiles it was given", () => {
    const bag = createTileBag();
    const shuffled = shuffle(bag, createRng(SEED));

    assert.equal(shuffled.length, bag.length);
    assert.deepEqual(ids(shuffled).sort(), ids(bag).sort());
    assert.deepEqual(
      shuffled.map((tile) => tile.points).sort((a, b) => a - b),
      bag.map((tile) => tile.points).sort((a, b) => a - b),
    );
  });

  it("leaves a bag too small to reorder alone", () => {
    const single: Tile[] = [{ id: "A-1", letter: "A", points: 1 }];

    assert.deepEqual(shuffle([], createRng(SEED)), []);
    assert.deepEqual(shuffle(single, createRng(SEED)), single);
  });
});

describe("dealHand", () => {
  it("deals the private tiles per seat and the community tiles after them", () => {
    for (const playerCount of [1, 2, 4, 6]) {
      const { privateTiles, community, rest } = dealHand({
        seed: SEED,
        playerCount,
        specialTiles: NO_SPECIAL_TILES,
      });
      const dealt = playerCount * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT;

      assert.equal(privateTiles.length, playerCount);
      for (const hand of privateTiles) {
        assert.equal(hand.length, PRIVATE_TILES_PER_PLAYER);
      }
      assert.equal(community.length, COMMUNITY_TILE_COUNT);
      assert.equal(rest.length, TILE_BAG_SIZE - dealt);
    }
  });

  it("deals every tile of the bag exactly once and never twice", () => {
    const { privateTiles, community, rest } = dealHand({ seed: SEED, playerCount: 6, specialTiles: NO_SPECIAL_TILES });
    const shown = [...privateTiles.flat(), ...community];
    const all = [...shown, ...rest];

    assert.equal(new Set(all.map((tile) => tile.id)).size, all.length);
    assert.equal(all.length, TILE_BAG_SIZE);
    assert.deepEqual(ids(all).sort(), ids(createTileBag()).sort());
  });

  it("reproduces the same table for the same seed, and a different one otherwise", () => {
    assert.deepEqual(dealHand({ seed: SEED, playerCount: 4 }), dealHand({ seed: SEED, playerCount: 4 }));
    assert.notDeepEqual(
      dealHand({ seed: SEED, playerCount: 4 }).privateTiles,
      dealHand({ seed: SEED + 1, playerCount: 4 }).privateTiles,
    );
  });

  it("cuts the shuffled bag at one fixed point, so a seed alone redraws the table", () => {
    const playerCount = 4;
    const shuffled = shuffle(createTileBag(), createRng(SEED));
    const { privateTiles, community, rest } = dealHand({ seed: SEED, playerCount, specialTiles: NO_SPECIAL_TILES });
    const privateTileCount = playerCount * PRIVATE_TILES_PER_PLAYER;

    assert.deepEqual(privateTiles, [
      shuffled.slice(0, PRIVATE_TILES_PER_PLAYER),
      shuffled.slice(PRIVATE_TILES_PER_PLAYER, 2 * PRIVATE_TILES_PER_PLAYER),
      shuffled.slice(2 * PRIVATE_TILES_PER_PLAYER, 3 * PRIVATE_TILES_PER_PLAYER),
      shuffled.slice(3 * PRIVATE_TILES_PER_PLAYER, privateTileCount),
    ]);
    assert.deepEqual(community, shuffled.slice(privateTileCount, privateTileCount + COMMUNITY_TILE_COUNT));
    assert.deepEqual(rest, shuffled.slice(privateTileCount + COMMUNITY_TILE_COUNT));
  });

  it("hands back independent collections, so mutating one leaves the others alone", () => {
    const { privateTiles, community, rest } = dealHand({ seed: SEED, playerCount: 3, specialTiles: NO_SPECIAL_TILES });
    const restBefore = ids(rest);

    privateTiles[0]?.splice(0, PRIVATE_TILES_PER_PLAYER);
    community.length = 0;

    assert.equal(rest.length, TILE_BAG_SIZE - (3 * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT));
    assert.deepEqual(ids(rest), restBefore);
    assert.equal(privateTiles.length, 3);
  });

  it("deals fresh hands on every call, so two tables never share tiles", () => {
    const first = dealHand({ seed: SEED, playerCount: 3 });
    const second = dealHand({ seed: SEED, playerCount: 3 });

    assert.deepEqual(first, second);
    assert.notEqual(first.privateTiles[0], second.privateTiles[0]);
    assert.notEqual(first.community, second.community);
  });

  it("requires a whole, positive number of players", () => {
    for (const playerCount of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => dealHand({ seed: SEED, playerCount }), RangeError, `playerCount ${playerCount}`);
    }
    assert.throws(() => dealHand({ seed: SEED, playerCount: 0 }), /whole number of players/);
  });

  it("refuses a table the bag cannot serve rather than dealing a short hand", () => {
    // 100 tiles = 2 per seat + 5 community, so 47 seats fits exactly and 48 does not.
    const seated = 47;
    const dealt = dealHand({ seed: SEED, playerCount: seated, specialTiles: NO_SPECIAL_TILES });

    assert.equal(dealt.privateTiles.length, seated);
    assert.ok(dealt.privateTiles.every((hand) => hand.length === PRIVATE_TILES_PER_PLAYER));
    assert.equal(dealt.community.length, COMMUNITY_TILE_COUNT);
    assert.equal(
      dealt.rest.length,
      TILE_BAG_SIZE - (seated * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT),
    );

    assert.throws(
      () => dealHand({ seed: SEED, playerCount: seated + 1 }),
      (error: unknown) =>
        error instanceof NotEnoughTilesError && error.message.includes("cannot draw"),
    );
  });
});
