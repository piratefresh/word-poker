/**
 * Special tiles at deal time (docs/rules/tiles.md §10, docs/rules/scoring.md §9): the
 * fixed-sequence tiles a hand plays with, and the multiplier a dealt tile carries.
 *
 * The 100-tile bag of §6 does not change. It holds the single letters and the two choice
 * tiles, exactly as the rules table says; a fixed-sequence tile is not a bag member but a
 * tile the *system* places, which is what §10 means by "the exact placement is controlled
 * by the game system and may vary each hand". This module is that placement, and it runs
 * on the cut the deal has already made:
 *
 * - It counts the two-letter tiles the shuffle dealt — the choice tiles are bag members,
 *   so a hand shows 0, 1, or 2 of them — and places fixed-sequence tiles from the
 *   configured pool, aiming for §10's "usually one private, usually one community,
 *   occasionally a third" and never crossing §10's cap of three two-letter tiles in a
 *   hand, choice and sequence together. The first placement takes a private slot, the
 *   second a community slot, and a third whatever is left; the tile each placement
 *   replaces goes back to the deck.
 * - It then rolls §9's multiplier for every dealt physical tile, one roll each, in deal
 *   order. High-value letters (8 points and up) carry the slightly higher double chance
 *   §9 allows, and a tile carries at most one multiplier: two would be a stacked modifier
 *   §9 says the game does not have.
 *
 * Everything the pass needs arrives as an argument — the dealt tiles, the seeded
 * generator, the table's configuration — so a seed plus a configuration replays the whole
 * deal (`AGENTS.md`). The generator is consumed in one documented order: one roll for the
 * hand's two-letter target, then a slot roll and a pair roll per placed tile, then one
 * roll per dealt tile for §9's multipliers.
 */

import type { LetterMultiplier, SequenceTile, Tile } from "@wordpoker/contracts";

import { LETTER_VALUES, type Letter } from "./letters";
import { swapAt } from "./tiles";

/** §10: across every seat and the board, a hand holds at most three two-letter tiles. */
export const TWO_LETTER_TILE_LIMIT = 3;

/** §6's top tiers — J and X at 8 points, Q and Z at 10 — the high-value letters of §9. */
const HIGH_VALUE_POINTS = 8;

/** A tile face's letter as the contract prints it: one capital A–Z, nothing else. */
const FACE_LETTER = /^[A-Z]$/;

/**
 * The pairs the default table plays with: §10's own examples (TH, ER, IN, ED), one copy
 * each, so a hand can place a given pair at most once.
 */
export const SEQUENCE_TILE_PAIRS: readonly (readonly [first: string, second: string])[] = [
  ["T", "H"],
  ["E", "R"],
  ["I", "N"],
  ["E", "D"],
];

/** What a table plays with: the sequence tiles it places, and the multipliers it rolls. */
export interface SpecialTilesConfig {
  /**
   * The fixed-sequence pairs the deal may place, each `[first, second]` in printed order.
   * Empty means the table plays the printed set only — no sequence tiles at all.
   */
  readonly sequencePairs: readonly (readonly [first: string, second: string])[];
  /**
   * §10's hand-level target for two-letter tiles, as `[count, weight]` pairs: the deal
   * picks a count by weight and places sequence tiles until the hand reaches it, choice
   * tiles included. Empty places none.
   */
  readonly twoLetterTargets: readonly (readonly [count: number, weight: number])[];
  /** §9: the chance an eligible dealt tile becomes a Double Letter tile. */
  readonly doubleLetterChance: number;
  /** §9: the chance it becomes a Triple Letter tile instead — "significantly rarer". */
  readonly tripleLetterChance: number;
  /** §9: the extra double chance a high-value letter carries. */
  readonly highValueDoubleBonus: number;
}

/**
 * The configuration the rules recommend, and the one a table starts with: §10's four
 * example pairs, a hand that usually reaches two two-letter tiles (mostly one private and
 * one community, occasionally a third), §9's "approximately 15%" double, a "significantly
 * rarer" triple, and a 5-point bump of extra double chance on the high-value letters.
 */
export const DEFAULT_SPECIAL_TILES: SpecialTilesConfig = {
  sequencePairs: SEQUENCE_TILE_PAIRS,
  twoLetterTargets: [
    [1, 10],
    [2, 70],
    [3, 20],
  ],
  doubleLetterChance: 0.15,
  tripleLetterChance: 0.03,
  highValueDoubleBonus: 0.05,
};

/** A table that plays the printed set only: no sequence tiles, no multipliers. */
export const NO_SPECIAL_TILES: SpecialTilesConfig = {
  sequencePairs: [],
  twoLetterTargets: [],
  doubleLetterChance: 0,
  tripleLetterChance: 0,
  highValueDoubleBonus: 0,
};

/** Where one dealt tile sits: the collection that holds it, and its slot in that array. */
interface Slot {
  readonly tiles: Tile[];
  readonly index: number;
  /** Whether the slot is a seat's private tile or one of the community tiles. */
  readonly at: "private" | "community";
}

/** What one deal's special-tile pass produced. */
export interface SpecialTilesResult {
  /** The seats' hands with the pass applied, one array per seat, in seat order. */
  readonly privateTiles: Tile[][];
  /** The board with the pass applied. */
  readonly community: Tile[];
  /** The tiles the placements replaced, in the order they were replaced. */
  readonly displaced: Tile[];
}

/** Zero-point values cannot become tiles; a probability outside `[0, 1]` is a bug in the table. */
function checkConfig(config: SpecialTilesConfig): void {
  for (const [first, second] of config.sequencePairs) {
    if (!FACE_LETTER.test(first) || !FACE_LETTER.test(second)) {
      throw new RangeError(`a sequence pair prints two capital A–Z letters, received "${first}${second}"`);
    }
  }

  for (const [count, weight] of config.twoLetterTargets) {
    if (!Number.isInteger(count) || count < 0 || !(weight > 0)) {
      throw new RangeError(`a two-letter target needs a whole count and a positive weight, received [${count}, ${weight}]`);
    }
  }

  const chances: readonly (readonly [name: string, value: number])[] = [
    ["doubleLetterChance", config.doubleLetterChance],
    ["tripleLetterChance", config.tripleLetterChance],
    ["highValueDoubleBonus", config.highValueDoubleBonus],
  ];
  for (const [name, value] of chances) {
    if (!(value >= 0 && value <= 1)) {
      throw new RangeError(`${name} is a probability between 0 and 1, received ${value}`);
    }
  }
}

/** §6's value for a face the config printed, with the letter checked before the table is read. */
function faceValue(letter: string): number {
  if (!FACE_LETTER.test(letter)) {
    throw new RangeError(`a tile face is one capital A–Z letter, received "${letter}"`);
  }
  return LETTER_VALUES[letter as Letter];
}

/** Whether a two-letter tile of either kind sits in the slot: §10's choice and sequence tiles. */
function isTwoLetterTile(tile: Tile): boolean {
  return "alternativeLetter" in tile || "sequenceLetter" in tile;
}

/** The highest printed value of the tile's faces, which is what §9's high-value test reads. */
function highestPoints(tile: Tile): number {
  if ("sequenceLetter" in tile) {
    return Math.max(tile.points, tile.sequencePoints);
  }
  if ("alternativeLetter" in tile) {
    return Math.max(tile.points, tile.alternativePoints);
  }
  return tile.points;
}

/**
 * Every dealt tile in deal order: each seat's private tiles in seat order, then the board.
 *
 * The order is the deal's, not this pass's, so a roll landed per slot is a roll landed per
 * slot of the table a player is looking at.
 */
function dealtSlots(hands: readonly Tile[][], community: Tile[]): Slot[] {
  const slots: Slot[] = [];

  for (const hand of hands) {
    for (let index = 0; index < hand.length; index += 1) {
      slots.push({ tiles: hand, index, at: "private" });
    }
  }
  for (let index = 0; index < community.length; index += 1) {
    slots.push({ tiles: community, index, at: "community" });
  }

  return slots;
}

/** The slots a sequence tile could still be placed in, optionally of one kind only. */
function openSlots(slots: readonly Slot[], at: "private" | "community" | null): Slot[] {
  return slots.filter((slot) => {
    const tile = slot.tiles[slot.index];
    if (tile === undefined || isTwoLetterTile(tile)) {
      return false;
    }
    return at === null || slot.at === at;
  });
}

/** Picks §10's target for this hand: one weighted draw over the configured counts. */
function rollTarget(targets: SpecialTilesConfig["twoLetterTargets"], rng: () => number): number {
  if (targets.length === 0) {
    return 0;
  }

  const total = targets.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [count, weight] of targets) {
    roll -= weight;
    if (roll < 0) {
      return count;
    }
  }

  // Floating-point slack can leave the last slot just above zero; the last target is the
  // one the roll reached, not a fallback: the weights sum to `total` by construction.
  return targets[targets.length - 1]?.[0] ?? 0;
}

/**
 * Places fixed-sequence tiles into the dealt slots, replacing the tile in each slot.
 *
 * The preferred kind of slot walks §10's recommendation: the first placement takes a
 * private slot, the second a community slot, a third whatever is left. A placement whose
 * preferred kind has no slot left falls back to the other kind rather than skipping — the
 * cap, not the kind, is what must hold.
 *
 * @returns The replaced tiles, in the order they were replaced.
 */
function placeSequences(slots: readonly Slot[], rng: () => number, config: SpecialTilesConfig): Tile[] {
  const twoLetterCount = slots.filter((slot) => {
    const tile = slot.tiles[slot.index];
    return tile !== undefined && isTwoLetterTile(tile);
  }).length;

  const placements = Math.min(
    rollTarget(config.twoLetterTargets, rng),
    TWO_LETTER_TILE_LIMIT - twoLetterCount,
    config.sequencePairs.length,
  );
  if (placements <= 0) {
    return [];
  }

  // A private copy, so the caller's pool is a record of what the table could place and the
  // partial Fisher–Yates below only reorders this hand's own working list.
  const pool = config.sequencePairs.slice();
  const displaced: Tile[] = [];

  for (let placed = 0; placed < placements; placed += 1) {
    const preferred = placed === 0 ? "private" : placed === 1 ? "community" : null;
    const ofKind = openSlots(slots, preferred);
    const open = ofKind.length > 0 ? ofKind : openSlots(slots, null);
    // Unreachable while the cap counts every two-letter tile already dealt: the cap leaves
    // at least `placements` slots free, and a hand is always seven or more tiles.
    const slot = open[Math.floor(rng() * open.length)];
    if (slot === undefined) {
      return displaced;
    }
    const pair = swapAt(pool, placed, placed + Math.floor(rng() * (pool.length - placed)));
    const replaced = slot.tiles[slot.index];
    if (replaced !== undefined) {
      displaced.push(replaced);
    }
    slot.tiles[slot.index] = sequenceTile(pair);
  }

  return displaced;
}

/** §10's fixed-sequence tile: both faces in printed order, each worth its §6 value. */
function sequenceTile([first, second]: readonly [string, string]): SequenceTile {
  return {
    // The `-seq-` marker keeps the id out of the bag's namespace: a table may configure
    // AE or TS as a sequence pair, and `AE-1` is already the bag's choice tile.
    id: `${first}${second}-seq-1`,
    letter: first,
    points: faceValue(first),
    sequenceLetter: second,
    sequencePoints: faceValue(second),
  };
}

/**
 * Rolls §9's multiplier for every dealt tile, in deal order, one roll each.
 *
 * The roll is read as one number so the two kinds cannot both land: the bottom
 * `tripleLetterChance` of the range is a Triple Letter tile, the next band a Double Letter
 * tile, and the rest leaves the tile as it was printed.
 */
function rollMultipliers(slots: readonly Slot[], rng: () => number, config: SpecialTilesConfig): void {
  for (const slot of slots) {
    const tile = slot.tiles[slot.index];
    if (tile === undefined) {
      continue;
    }

    const double = config.doubleLetterChance + (highestPoints(tile) >= HIGH_VALUE_POINTS ? config.highValueDoubleBonus : 0);
    const roll = rng();
    const multiplier: LetterMultiplier | undefined =
      roll < config.tripleLetterChance
        ? "triple-letter"
        : roll < config.tripleLetterChance + double
          ? "double-letter"
          : undefined;

    if (multiplier !== undefined) {
      slot.tiles[slot.index] = { ...tile, multiplier };
    }
  }
}

/**
 * Applies the table's special tiles to a deal's cut: sequence placement, then multipliers.
 *
 * Copies on the way in, like every other engine step: the arrays handed back are the
 * caller's, and the deal they were built from is left as evidence of what was drawn before
 * the pass touched it.
 *
 * @param options The dealt hands and board, the seeded generator, and the table's config.
 * @returns The same shape with the pass applied, plus the tiles it displaced.
 * @throws {RangeError} When the configuration cannot describe a table.
 */
export function applySpecialTiles({
  privateTiles,
  community,
  rng,
  config,
}: {
  readonly privateTiles: readonly (readonly Tile[])[];
  readonly community: readonly Tile[];
  readonly rng: () => number;
  readonly config: SpecialTilesConfig;
}): SpecialTilesResult {
  checkConfig(config);

  const hands = privateTiles.map((hand) => hand.slice());
  const board = community.slice();
  const slots = dealtSlots(hands, board);

  const displaced = placeSequences(slots, rng, config);
  rollMultipliers(slots, rng, config);

  return { privateTiles: hands, community: board, displaced };
}
