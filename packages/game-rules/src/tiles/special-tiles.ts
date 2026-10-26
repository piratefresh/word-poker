/**
 * Special tiles at deal time (docs/rules/tiles.md §10, docs/rules/scoring.md §9): the choice
 * tiles the deal places, and the multiplier a dealt tile carries.
 *
 * The bag holds single letters only, and every two-letter tile is a choice tile (ADR 0005,
 * §6), so the deal is what puts the two-letter tiles on the table: it draws a hand-level
 * target and places tiles from the table's pair pool until the hand reaches it, replacing the
 * tile in each slot and handing the replaced tile back to the deck (§10). This module is that
 * placement, and it runs on the cut the deal has already made:
 *
 * - §10's cap counts the seven tiles one seat can play — its two private tiles and the five
 *   community tiles — and at most three of them are choice tiles. The per-street limits fall
 *   out of the same count: the flop's three tiles hold 0–2, and the turn and the river hold at
 *   most one each, because each of those is a single tile.
 * - The target walks §10's recommendation to aim for two, preferably one private and one
 *   community, with an occasional third: the first placement takes a private slot, the second
 *   a community slot, and a third whatever is left open.
 * - It then rolls §9's multiplier for every dealt physical tile, one roll each, in deal
 *   order. A high-value tile — its best printed face worth 5 or more (§6) — carries the
 *   slightly higher double chance §9 allows, and a tile carries at most one multiplier: two
 *   would be a stacked modifier §9 says the game does not have.
 *
 * Everything the pass needs arrives as an argument — the dealt tiles, the seeded generator,
 * the table's configuration — so a seed plus a configuration replays the whole deal
 * (`AGENTS.md`). The generator is consumed in one documented order: one roll for the hand's
 * two-letter target, then a slot roll and a pair roll per placed tile, then one roll per dealt
 * tile for §9's multipliers.
 */

import type { ChoiceTile, LetterMultiplier, Tile } from "@wordpoker/contracts";

import { LETTER_VALUES, type Letter } from "./letters";
import { swapAt } from "./tiles";

/** §10: across every seat and the board, a hand holds at most three two-letter tiles. */
export const TWO_LETTER_TILE_LIMIT = 3;

/**
 * §9's high-value tier: a tile whose best printed face is worth this much or more, which §6
 * lists as F, H, V, W, Y, K (5), J, X (8) and Q, Z (10).
 */
const HIGH_VALUE_POINTS = 5;

/**
 * §10: how many community tiles the flop holds. The board is the flop's three tiles followed by
 * the turn and the river (the reveal table in `./offline`), so slots 0–2 are the flop and 3 and
 * 4 are the single-tile streets.
 */
const FLOP_TILES = 3;

/** §10: the flop's three tiles hold at most two choice tiles between them. */
const FLOP_CHOICE_LIMIT = 2;

/** A tile face's letter as the contract prints it: one capital A–Z, nothing else. */
const FACE_LETTER = /^[A-Z]$/;

/**
 * The pairs the default table plays with: §10's pair pool, one copy each, so a hand can place a
 * given pair at most once.
 *
 * Each pair names two letters; what a face is worth is §6's value for it, read through
 * {@link faceValue}, so the pool never restates the letter values. The pairs whose faces are
 * worth different amounts are §10's high-value ones — Q/K (10/5), Z/X (10/8), J/H (8/5).
 */
export const CHOICE_TILE_PAIRS: readonly (readonly [first: string, second: string])[] = [
  ["A", "E"],
  ["E", "I"],
  ["O", "U"],
  ["A", "I"],
  ["T", "S"],
  ["R", "N"],
  ["D", "T"],
  ["S", "L"],
  ["Q", "K"],
  ["Z", "X"],
  ["J", "H"],
];

/** What a table plays with: the choice-tile pairs it places, and the multipliers it rolls. */
export interface SpecialTilesConfig {
  /**
   * The pairs the deal may place, each `[first, second]` as the tile prints them. One copy of
   * each pair per hand; empty means the table places no choice tiles at all.
   */
  readonly choicePairs: readonly (readonly [first: string, second: string])[];
  /**
   * §10's hand-level target for two-letter tiles, as `[count, weight]` pairs: the deal picks a
   * count by weight and places choice tiles until the hand reaches it. Empty places none.
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
 * The configuration the rules recommend, and the one a table starts with: §10's eleven pair
 * pool, a hand that usually reaches two two-letter tiles (mostly one private and one community,
 * occasionally a third), §9's "approximately 15%" double, a "significantly rarer" triple, and a
 * 5-point bump of extra double chance on the high-value letters.
 */
export const DEFAULT_SPECIAL_TILES: SpecialTilesConfig = {
  choicePairs: CHOICE_TILE_PAIRS,
  twoLetterTargets: [
    [1, 10],
    [2, 70],
    [3, 20],
  ],
  doubleLetterChance: 0.15,
  tripleLetterChance: 0.03,
  highValueDoubleBonus: 0.05,
};

/** A table that plays the printed set only: no choice tiles, no multipliers. */
export const NO_SPECIAL_TILES: SpecialTilesConfig = {
  choicePairs: [],
  twoLetterTargets: [],
  doubleLetterChance: 0,
  tripleLetterChance: 0,
  highValueDoubleBonus: 0,
};

/** Where one dealt tile sits: the collection that holds it, and its slot in that array. */
type Slot =
  | {
      readonly tiles: Tile[];
      readonly index: number;
      /** A seat's private tile, in the hand of `seat`. */
      readonly at: "private";
      /** Which seat plays it; §10's cap is counted per seat. */
      readonly seat: number;
    }
  | {
      readonly tiles: Tile[];
      readonly index: number;
      /** One of the five community tiles, which every seat plays. */
      readonly at: "community";
    };

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
  for (const [first, second] of config.choicePairs) {
    if (!FACE_LETTER.test(first) || !FACE_LETTER.test(second)) {
      throw new RangeError(`a choice pair prints two capital A–Z letters, received "${first}${second}"`);
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

/** How many of a run of slots hold a two-letter tile — §10 counts in physical tiles. */
function twoLetterCount(slots: readonly Slot[]): number {
  let count = 0;

  for (const slot of slots) {
    const tile = slot.tiles[slot.index];
    if (tile !== undefined && "alternativeLetter" in tile) {
      count += 1;
    }
  }

  return count;
}

/**
 * Every dealt tile in deal order: each seat's private tiles in seat order, then the board.
 *
 * The order is the deal's, not this pass's, so a roll landed per slot is a roll landed per
 * slot of the table a player is looking at.
 */
function dealtSlots(hands: readonly Tile[][], community: Tile[]): Slot[] {
  const slots: Slot[] = [];

  for (const [seat, hand] of hands.entries()) {
    for (let index = 0; index < hand.length; index += 1) {
      slots.push({ tiles: hand, index, at: "private", seat });
    }
  }
  for (let index = 0; index < community.length; index += 1) {
    slots.push({ tiles: community, index, at: "community" });
  }

  return slots;
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
 * Places choice tiles into the dealt slots, replacing the tile in each slot.
 *
 * §10's cap is what every rule below is counted against: a seat plays its two private tiles and
 * the five community tiles, and at most three of those seven are choice tiles. A private
 * placement therefore spends one of its own seat's three, while a board placement spends one of
 * every seat's — and the flop's three tiles hold at most two between them, the turn and the
 * river one each, which a free single-tile street satisfies by construction.
 *
 * The preferred kind of slot walks §10's recommendation: the first placement takes a private
 * slot, the second a community slot, a third whatever is left. A placement whose preferred kind
 * has no slot left falls back to the other kind rather than skipping — the cap, not the kind,
 * is what must hold.
 *
 * @returns The replaced tiles, in the order they were replaced.
 */
function placeChoices(slots: readonly Slot[], rng: () => number, config: SpecialTilesConfig): Tile[] {
  const board = slots.filter((slot) => slot.at === "community");
  const flop = board.filter((slot) => slot.index < FLOP_TILES);

  // §10's counts as they stand, and as each placement moves them: the choice tiles a seat holds
  // privately, one count per seat in seat order, and the choice tiles on the board — which
  // every seat plays, so they count for all of them. Both are read off the dealt tiles rather
  // than assumed empty, because a caller may hand over a hand that already carries some.
  const choicePerSeat: number[] = [];
  for (const slot of slots) {
    if (slot.at !== "private") {
      continue;
    }
    const tile = slot.tiles[slot.index];
    choicePerSeat[slot.seat] =
      (choicePerSeat[slot.seat] ?? 0) +
      (tile !== undefined && "alternativeLetter" in tile ? 1 : 0);
  }
  let boardChoice = twoLetterCount(board);

  /** The slots §10 still lets a choice tile land in, optionally of one kind only. */
  const openSlots = (at: "private" | "community" | null): Slot[] =>
    slots.filter((slot) => {
      const tile = slot.tiles[slot.index];
      if (tile === undefined || "alternativeLetter" in tile) {
        return false;
      }
      if (at !== null && slot.at !== at) {
        return false;
      }
      if (slot.at === "community") {
        // A free turn or river slot is already inside its limit of one, so only the flop's
        // own limit can close a community slot that holds no two-letter tile yet.
        if (slot.index < FLOP_TILES && twoLetterCount(flop) >= FLOP_CHOICE_LIMIT) {
          return false;
        }
        // Every seat plays the board, so this placement has to fit in each of their sevens.
        return choicePerSeat.every((privately) => privately + boardChoice + 1 <= TWO_LETTER_TILE_LIMIT);
      }
      return (choicePerSeat[slot.seat] ?? 0) + boardChoice + 1 <= TWO_LETTER_TILE_LIMIT;
    });

  // The pool is the one bound the rules do not express: a target taller than the pair pool
  // would otherwise ask the partial Fisher–Yates below for a pair past the end of it. How many
  // placements §10 actually allows is decided slot by slot, below.
  const placements = Math.min(rollTarget(config.twoLetterTargets, rng), config.choicePairs.length);
  if (placements <= 0) {
    return [];
  }

  // A private copy, so the caller's pool is a record of what the table could place and the
  // partial Fisher–Yates below only reorders this hand's own working list.
  const pool = config.choicePairs.slice();
  const displaced: Tile[] = [];

  for (let placed = 0; placed < placements; placed += 1) {
    const preferred = placed === 0 ? "private" : placed === 1 ? "community" : null;
    const ofKind = openSlots(preferred);
    const open = ofKind.length > 0 ? ofKind : openSlots(null);
    // Reachable only from a hand already at §10's cap or with a full flop: the pass stops
    // where the rules do, and stops without spending a roll it has nowhere to put.
    if (open.length === 0) {
      break;
    }
    const slot = open[Math.floor(rng() * open.length)];
    // Unreachable while the index is inside `open`, but the read is optional under
    // `noUncheckedIndexedAccess`, so it is spelled out rather than cast.
    if (slot === undefined) {
      break;
    }
    const pair = swapAt(pool, placed, placed + Math.floor(rng() * (pool.length - placed)));
    const replaced = slot.tiles[slot.index];
    if (replaced !== undefined) {
      displaced.push(replaced);
    }
    slot.tiles[slot.index] = choiceTile(pair);
    if (slot.at === "community") {
      boardChoice += 1;
    } else {
      choicePerSeat[slot.seat] = (choicePerSeat[slot.seat] ?? 0) + 1;
    }
  }

  return displaced;
}

/** §10's choice tile: one physical tile printing both faces, each worth its §6 value. */
export function choiceTile([first, second]: readonly [string, string]): ChoiceTile {
  return {
    // The pair itself names the tile: the pool places each pair once and the bag holds single
    // letters only, so `AE-1` is a tile of its own on any table (ADR 0005).
    id: `${first}${second}-1`,
    letter: first,
    points: faceValue(first),
    alternativeLetter: second,
    alternativePoints: faceValue(second),
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

    // §9's high-value tier reads the best face the tile prints: either face of a choice pair,
    // or the one letter of a plain tile.
    const bestFace =
      "alternativeLetter" in tile ? Math.max(tile.points, tile.alternativePoints) : tile.points;
    const double = config.doubleLetterChance + (bestFace >= HIGH_VALUE_POINTS ? config.highValueDoubleBonus : 0);
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
 * Applies the table's special tiles to a deal's cut: choice placement, then multipliers.
 *
 * Copies on the way in, like every other engine step: the arrays handed back are the caller's,
 * and the deal they were built from is left as evidence of what was drawn before the pass
 * touched it.
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

  const displaced = placeChoices(slots, rng, config);
  rollMultipliers(slots, rng, config);

  return { privateTiles: hands, community: board, displaced };
}
