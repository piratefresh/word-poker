/**
 * played-word.ts — what one seat's confirmed word was worth, read off the settled hand.
 *
 * The reveal's record (§20): the submission §19's window kept, re-resolved against the tiles
 * the seat built from, priced by §7 and handed back with the physical tiles in word order. The
 * results surface draws it offline and the room broadcasts it online, so both read the same
 * breakdown out of the engine rather than adding one up of their own.
 */

import type { Tile } from "@wordpoker/contracts";

import { evaluateWord } from "./building";
import { availableTiles, type OfflineState } from "./offline";
import { scoreWord } from "./scoring";

/** One seat's confirmed word: §7's three parts, its total, and the tiles it played. */
export interface PlayedWord {
  /**
   * The physical tiles, in word order (§10) — a sequence tile arrives as the one tile it is,
   * never as the two letters it prints.
   */
  readonly tiles: readonly Tile[];
  /** §7 step 1: the letters' printed values, before any tile multiplier. */
  readonly base: number;
  /** §7 step 2: what the tile multipliers added — Σ(`value` − `baseValue`). */
  readonly mult: number;
  /** §7 step 3: the Full Rack Bonus. */
  readonly rack: number;
  /** `base + mult + rack`: the score §21 ranked the seat by. */
  readonly total: number;
}

/**
 * §7's breakdown for one seat, or `null` when it confirmed no word or the word did not stand
 * (§11). Base, Mult and Rack add up to the total §21 ranked, so the parts and the total can
 * never disagree about the same word.
 */
export function playedWord(state: OfflineState, seat: number): PlayedWord | null {
  const slot = state.wordWindow?.slots.find((candidate) => candidate.seat === seat);
  if (slot?.status !== "confirmed") return null;

  const available = availableTiles(state, seat);
  const evaluation = evaluateWord({
    available,
    submission: slot.submission,
    dictionary: state.dictionary,
  });
  if (!evaluation.valid) return null;

  const score = evaluation.score ?? scoreWord(evaluation.tiles);
  const tiles = new Map(available.map((tile) => [tile.id, tile]));

  return {
    tiles: evaluation.tiles.flatMap((played) => {
      const tile = tiles.get(played.tileId);
      return tile === undefined ? [] : [tile];
    }),
    base: score.letters.reduce((total, letter) => total + letter.baseValue, 0),
    mult: score.letters.reduce((total, letter) => total + (letter.value - letter.baseValue), 0),
    rack: score.fullRackBonus,
    total: score.total,
  };
}
