/** Strips and the windows the grid shows of them (§47, Strips and grid). */

import type { Tile } from "@wordpoker/contracts";

import { HIGH_VALUE_POINTS } from "../tiles/special-tiles";
import { createTileBag } from "../tiles/tiles";
import type { SlotSpellerConfig } from "./config";
import { powerCount, type SlotPowerCounts } from "./powers";
import { slotRng } from "./seed";

/** The bag's letters, one entry per copy: drawing an index uniformly draws by the bag's distribution. */
const BAG_LETTERS: readonly { letter: string; points: number }[] = createTileBag().map(({ letter, points }) => ({
  letter,
  points,
}));

/** Rows the grid shows: the config's plus one per Extra Row held. */
export function rowCount(config: SlotSpellerConfig, powers: SlotPowerCounts): number {
  return config.rows + powerCount(powers, "extraRow");
}

/** A strip tile's id: unique per reel and strip position. */
export function stripTileId(reel: number, position: number): string {
  return `s${reel}-${position}`;
}

/**
 * Reel `reel`'s strip: each tile drawn independently, with replacement, from the bag's letter
 * distribution, then one multiplier roll — triple below TL, else double below DL (+ the
 * high-value bonus).
 */
export function buildStrip(seed: string, reel: number, config: SlotSpellerConfig): Tile[] {
  const rng = slotRng(seed, "strip", reel);
  const { doubleLetterChance, tripleLetterChance, highValueDoubleBonus } = config.tileRates;
  const strip: Tile[] = [];

  for (let position = 0; position < config.stripLength; position += 1) {
    const drawn = BAG_LETTERS[Math.floor(rng() * BAG_LETTERS.length)] ?? { letter: "E", points: 1 };
    const roll = rng();
    const tile: Tile = { id: stripTileId(reel, position), letter: drawn.letter, points: drawn.points };
    const double = tripleLetterChance + doubleLetterChance + (drawn.points >= HIGH_VALUE_POINTS ? highValueDoubleBonus : 0);
    if (roll < tripleLetterChance) tile.multiplier = "triple-letter";
    else if (roll < double) tile.multiplier = "double-letter";
    strip.push(tile);
  }

  return strip;
}

/**
 * Wild Reel: `wildBlanksPerStrip` blanks written over random positions of reel `reel`'s strip,
 * with replacement (two draws may land on one position), each keeping that position's tile id.
 */
export function addWildBlanks(strip: readonly Tile[], seed: string, reel: number, config: SlotSpellerConfig): Tile[] {
  const rng = slotRng(seed, "wild", reel);
  const next = [...strip];
  for (let i = 0; i < config.wildBlanksPerStrip && next.length > 0; i += 1) {
    const position = Math.floor(rng() * next.length);
    next[position] = { id: stripTileId(reel, position), letter: "?", points: 0, blank: true };
  }
  return next;
}

/** `index` wrapped onto a strip of `length`. */
export function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}

/** The strip tile at `index`, wrapping. */
export function stripAt(strip: readonly Tile[], index: number): Tile {
  const tile = strip[wrap(index, strip.length)];
  if (tile === undefined) throw new RangeError("Slot Speller strip is empty");
  return tile;
}

/** The `rows` consecutive strip tiles from `top`, wrapping. */
export function windowAt(strip: readonly Tile[], top: number, rows: number): Tile[] {
  return Array.from({ length: rows }, (_, row) => stripAt(strip, top + row));
}
