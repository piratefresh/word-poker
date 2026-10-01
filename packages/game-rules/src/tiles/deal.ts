/**
 * Dealing: turning the bag into the tiles a hand shows.
 *
 * A hand is a fixed deal order — every seat's private tiles in seat order, then the
 * community — and that order is what makes a seed mean anything. The server and every
 * client run this same function with the same seed, so the contract is "shuffle the bag,
 * cut it in one documented place, then apply the table's special tiles", and nothing else:
 * the first seat's first private tile is the first tile of the shuffle, the community is
 * the next five, and the remainder stays in the bag. Pure like the rest of the engine — the
 * seed is the only randomness, and it arrives as an argument (`AGENTS.md`).
 */

import type { Tile } from "@wordpoker/contracts";

import { createRng } from "../core/rng";
import { applySpecialTiles, DEFAULT_SPECIAL_TILES, type SpecialTilesConfig } from "./special-tiles";
import { createTileBag, NotEnoughTilesError, swapAt, TILE_BAG_SIZE } from "./tiles";

/**
 * Private tiles each player is dealt. Two is the whole private hand: the community holds
 * the five shared tiles, and a player's word is built from both.
 */
export const PRIVATE_TILES_PER_PLAYER = 2;

/** Community tiles on the table, shared by every player at the hand. */
export const COMMUNITY_TILE_COUNT = 5;

/**
 * Returns a shuffled copy of a bag, using a full Fisher–Yates pass.
 *
 * Walking from the end, each slot is exchanged with a uniformly chosen slot at or before
 * it, so all `n!` orders are equally likely; the final slot has nothing left to swap with
 * and therefore consumes no `rng` call, which keeps the number of calls per shuffle equal
 * to `bag.length - 1`. Copying first keeps the caller's bag intact — a shuffle that ate
 * its input would leave the table unable to say what was dealt from what.
 *
 * @param bag The tiles to shuffle; not modified.
 * @param rng The seeded generator to shuffle with, as built by `createRng`.
 * @returns A new array holding the same tiles in a seeded random order; a bag of fewer
 *   than two tiles comes back as an equal copy, because there is nothing to reorder.
 */
export function shuffle(bag: readonly Tile[], rng: () => number): Tile[] {
  const shuffled = bag.slice();

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    swapAt(shuffled, i, Math.floor(rng() * (i + 1)));
  }

  return shuffled;
}

/**
 * Deals one hand from one seed: private tiles per player, then the community.
 *
 * The seats are served in order — seat 0 takes the first
 * {@link PRIVATE_TILES_PER_PLAYER} tiles of the shuffle, seat 1 the next two, and so on —
 * and the {@link COMMUNITY_TILE_COUNT} community tiles follow immediately after the last
 * seat, with everything left over going back as `rest`. No tile is ever dealt twice,
 * because the deal is a set of disjoint slices of one shuffled bag. Seats are positional
 * rather than keyed by player id on purpose: the caller knows the seating, and the same
 * seed must reproduce the same table no matter who ends up sitting in which seat.
 *
 * The cut is then handed to the table's special tiles: §10's choice tiles are placed into it
 * and §9's multipliers rolled onto it, from the same seeded generator (`./special-tiles`). A
 * table that plays none passes {@link NO_SPECIAL_TILES} and gets the bare cut back. `rest` is
 * the shuffle's remainder followed by the tiles the placements replaced, in the order they
 * were replaced — the deck a hand did not show.
 *
 * @param options The `seed` every participant replays, the number of seated players, and
 *   the table's special-tile configuration.
 * @throws {RangeError} When `playerCount` is not a positive integer.
 */
export function dealHand({
  seed,
  playerCount,
  specialTiles = DEFAULT_SPECIAL_TILES,
}: {
  seed: number;
  playerCount: number;
  specialTiles?: SpecialTilesConfig;
}): {
  privateTiles: Tile[][];
  community: Tile[];
  rest: Tile[];
} {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new RangeError(`dealHand needs a whole number of players, received ${playerCount}`);
  }

  // A hand is a fixed slice of one bag, so a table too big to serve is a refusal rather
  // than a deal that quietly hands someone a short hand or an empty board.
  const required = playerCount * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT;
  if (required > TILE_BAG_SIZE) {
    throw new NotEnoughTilesError(required, TILE_BAG_SIZE);
  }

  const rng = createRng(seed);
  const bag = shuffle(createTileBag(), rng);
  const privateTileCount = playerCount * PRIVATE_TILES_PER_PLAYER;

  // One contiguous run of the shuffled bag, cut three ways: hands, community, remainder.
  const privateTiles: Tile[][] = [];
  for (let seat = 0; seat < playerCount; seat += 1) {
    const from = seat * PRIVATE_TILES_PER_PLAYER;
    privateTiles.push(bag.slice(from, from + PRIVATE_TILES_PER_PLAYER));
  }
  const community = bag.slice(privateTileCount, privateTileCount + COMMUNITY_TILE_COUNT);

  const special = applySpecialTiles({ privateTiles, community, rng, config: specialTiles });

  return {
    privateTiles: special.privateTiles,
    community: special.community,
    rest: [...bag.slice(privateTileCount + COMMUNITY_TILE_COUNT), ...special.displaced],
  };
}
