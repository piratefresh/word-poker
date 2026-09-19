/**
 * The tile bag: what a Word Poker set contains, and how tiles come out of it.
 *
 * The counts here are transcribed from docs/FINAL_RULES.md §"Tile Bag Distribution", and
 * the values come from §6 through `./letters`, which owns the package's one letter→value
 * table. The bag is the one piece of shared state both sides must agree on down to the
 * last tile: the server deals from it, the client replays the same seed, and an extra `A`
 * on one side is a hand that reconciles to nothing. The module is pure: the bag comes from
 * a constant table, and the only randomness in a draw is the caller's injected `rng`
 * (AGENTS.md) — never `Math.random`, never a clock.
 */

import type { Tile } from "@wordpoker/contracts";

import { LETTER_VALUES, type Letter } from "./letters";

/** How many tiles a fresh bag holds: 98 single letters plus the two two-letter tiles. */
export const TILE_BAG_SIZE = 100;

/**
 * Raised when a draw asks for more tiles than the bag still holds.
 *
 * A named class rather than a bare `Error` so a caller can catch exactly this and let
 * everything else keep propagating: running out mid-deal is a table-level condition
 * (there is no such thing as a partial hand), while a `TypeError` from the same call is a
 * bug. Both numbers ride along in the message because by the time the error surfaces, the
 * bag it was thrown from is usually out of scope.
 */
export class NotEnoughTilesError extends Error {
  constructor(requested: number, available: number) {
    super(`cannot draw ${requested} tiles: the bag holds ${available}`);
    this.name = "NotEnoughTilesError";
  }
}

/**
 * The single-letter half of the bag, one entry per letter, in alphabetical order: the
 * counts of §"Tile Bag Distribution", which the rules document states per tile.
 *
 * Values are deliberately absent. A letter's worth lives in {@link LETTER_VALUES} (§6) and
 * nowhere else, so the two facts stay in the two tables the rules document keeps them in —
 * "how many A tiles" here, "what an A is worth" there — instead of one table restating the
 * other and eventually disagreeing with it.
 */
const SINGLE_LETTER_TILES: readonly (readonly [letter: Letter, copies: number])[] = [
  ["A", 9],
  ["B", 2],
  ["C", 2],
  ["D", 4],
  ["E", 12],
  ["F", 2],
  ["G", 3],
  ["H", 2],
  ["I", 9],
  ["J", 1],
  ["K", 1],
  ["L", 4],
  ["M", 2],
  ["N", 6],
  ["O", 8],
  ["P", 2],
  ["Q", 1],
  ["R", 6],
  ["S", 4],
  ["T", 6],
  ["U", 4],
  ["V", 2],
  ["W", 2],
  ["X", 1],
  ["Y", 2],
  ["Z", 1],
];

/**
 * The two two-letter choice tiles, as
 * `[letter, alternativeLetter, points, alternativePoints]`.
 *
 * A choice tile plays as either of its faces, and the face the player picked is the one
 * that scores (§10), so each face carries its own value rather than a single number for
 * the tile. Both pairs shipped here happen to be equal-valued — A/E are 1 and 1, T/S are
 * 2 and 2 — and the rules' other pairs (Q/K) are not, which is why the field exists. They
 * are bag members like any other, which is what caps a hand at two of them.
 */
const TWO_LETTER_TILES: readonly (readonly [
  letter: string,
  alternativeLetter: string,
  points: number,
  alternativePoints: number,
])[] = [
  ["A", "E", 1, 1],
  ["T", "S", 2, 2],
];

/**
 * Builds a fresh, unshuffled bag of {@link TILE_BAG_SIZE} tiles.
 *
 * Single letters come out A–Z, each letter's copies numbered from 1 (`A-1` … `A-9`), then
 * the two two-letter tiles (`AE-1`, `TS-1`). The bag's order is therefore a property of
 * the table, not of when tiles were built, and the ids are built from the letter rather
 * than a running counter so a tile stays identifiable in a log, a test failure, or a
 * serialize-and-inspect: `#37` would say nothing about what it is.
 *
 * @returns A new array of new tile objects every call — two tables must never share tile
 *   objects, because a bag is mutable state in the hands of whoever receives it.
 */
export function createTileBag(): Tile[] {
  const bag: Tile[] = [];

  for (const [letter, copies] of SINGLE_LETTER_TILES) {
    const points = LETTER_VALUES[letter];
    for (let copy = 1; copy <= copies; copy += 1) {
      bag.push({ id: `${letter}-${copy}`, letter, points });
    }
  }

  for (const [letter, alternativeLetter, points, alternativePoints] of TWO_LETTER_TILES) {
    bag.push({
      id: `${letter}${alternativeLetter}-1`,
      letter,
      points,
      alternativeLetter,
      alternativePoints,
    });
  }

  return bag;
}

/**
 * Exchanges two slots of an array in place and returns whatever landed in the first slot.
 *
 * The bounds check is not decoration and it is not a guess: `noUncheckedIndexedAccess`
 * widens every index read to `T | undefined`, so a swap cannot be written without
 * narrowing the two reads first. Both callers — `draw` here and `shuffle` in `./deal` —
 * derive their indices from the array's own length, so no index is ever out of range.
 * Shared from this module rather than duplicated, so the two shuffles cannot drift.
 */
export function swapAt<T>(items: T[], first: number, second: number): T {
  const atFirst = items[first];
  const atSecond = items[second];
  if (atFirst === undefined || atSecond === undefined) {
    throw new RangeError(`cannot swap slots ${first} and ${second} of a ${items.length}-element array`);
  }

  items[first] = atSecond;
  items[second] = atFirst;
  return atSecond;
}

/**
 * Takes `count` tiles out of a bag at random, leaving the bag itself untouched.
 *
 * The pick is a partial Fisher–Yates over a private copy: at step `i` one tile is chosen
 * uniformly from the tiles not yet taken and swapped into slot `i`, so every subset of
 * `count` tiles is equally likely and the order within `drawn` is random too — a partial
 * pass, not a full shuffle, because drawing 2 of 100 has no reason to pay for 100 swaps.
 * Exactly one `rng` call per tile drawn, which is what makes the draw reproducible from a
 * seed, and which callers rely on when they draw twice in a row from one generator.
 *
 * The bag is copied, never reordered: the caller keeps it as the record of what the table
 * still holds. `rest` is returned in the *bag's* order rather than the order the swaps
 * happen to leave behind, so the remainder of a draw depends only on which tiles left,
 * not on how the sampler is implemented.
 *
 * @param bag The tiles to draw from; not modified.
 * @param count How many tiles to take, an integer in `[0, bag.length]`.
 * @param rng The seeded generator to draw with, as built by `createRng`.
 * @throws {RangeError} When `count` is negative or not an integer.
 * @throws {NotEnoughTilesError} When `count` is more tiles than `bag` holds.
 */
export function draw(bag: readonly Tile[], count: number, rng: () => number): { drawn: Tile[]; rest: Tile[] } {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`draw count must be a non-negative integer, received ${count}`);
  }
  if (count > bag.length) {
    throw new NotEnoughTilesError(count, bag.length);
  }

  // `pool` holds the tiles and `positions` holds where each one sat in `bag`; the two are
  // swapped in lockstep, so after `count` passes the taken input positions are known and
  // `rest` can be picked straight out of the untouched input.
  const pool = bag.slice();
  const positions = bag.map((_, index) => index);
  const drawn: Tile[] = [];

  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(rng() * (pool.length - i));
    drawn.push(swapAt(pool, i, j));
    swapAt(positions, i, j);
  }

  const taken = new Set(positions.slice(0, count));

  return { drawn, rest: bag.filter((_, index) => !taken.has(index)) };
}
