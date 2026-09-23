/**
 * Showdown on the wire: how the seats that reached the reveal are ordered, and what broke
 * the ties between them (docs/rules/hand-flow.md §20, docs/rules/betting-and-pots.md §21).
 *
 * The result is a ranking, not a winner: pot settlement walks it (each pot is settled by the
 * same ladder, §25) and the reveal shows it, so every seat needs a place and the comparison
 * that put it there. Steps are named rather than numbered because these cross the wire into
 * logs and UI copy — `"highest-letter"` says what happened, and reordering the ladder can
 * never renumber a step a client already understands.
 */

import type { PlayerId } from "./players";

/**
 * What decided a seat's place, in the order the ladder applies it (§21).
 *
 * `"final-score"` is not a tie-break: it is §7's total, which orders the field before any
 * tie-break is reached, and it is what a seat that tied with nobody was placed by.
 */
export const SHOWDOWN_DECIDERS = [
  /** §7's final score, highest first — the ladder's starting order. */
  "final-score",
  /** §21.1: the word with the most letters — one per tile, the face a choice tile played (§10). */
  "word-length",
  /** §21.2: the highest *printed* letter value; tile multipliers do not count. */
  "highest-letter",
  /** §21.3: one temporary tile each, highest printed value wins, repeated until it does not tie. */
  "tile-draw",
] as const;

/** What decided a seat's place in the showdown ranking. */
export type ShowdownDecider = (typeof SHOWDOWN_DECIDERS)[number];

/** One seat's place in the ranking, best first. */
export interface ShowdownStanding {
  readonly playerId: PlayerId;
  /** The seat the player played from; the ladder never reads it, and the UI labels it. */
  readonly seat: number;
  /** §7's final score; `0` when the seat had no valid word (§11). */
  readonly score: number;
  /** 1-based place, best first: the ladder separates every pair of seats, so it is unique. */
  readonly place: number;
  /** The comparison this seat's place came out of. */
  readonly decidedBy: ShowdownDecider;
  /**
   * What `decidedBy` compared for this seat: the final score, the word's letter count, the
   * highest printed letter value, or the tile it drew. `null` when the seat had no word to
   * compare (§11) — which is the case the draw exists to settle.
   */
  readonly compared: number | null;
}

/** What one seat brought to one comparison. */
export interface ShowdownComparisonValue {
  readonly playerId: PlayerId;
  /** The value compared, or `null` when this seat had nothing to offer at this step (§11). */
  readonly value: number | null;
}

/**
 * One pass of the ladder over one group of tied seats.
 *
 * Every seat still in the tie appears in `values`, best first, so a reveal can show the
 * whole group rather than only who won it; `advanced` is the group that stayed tied on top
 * and went on to the next step (or, on a draw round, to the next draw).
 */
export interface ShowdownComparison {
  readonly step: ShowdownDecider;
  /** Which draw round this was, counting from 1; the three comparison steps are always 1. */
  readonly round: number;
  readonly values: readonly ShowdownComparisonValue[];
  readonly advanced: readonly PlayerId[];
}

/** A settled showdown: every contesting seat placed, and the comparisons that placed them. */
export interface ShowdownRanking {
  readonly standings: readonly ShowdownStanding[];
  /** The ladder's passes, in the order it made them. */
  readonly comparisons: readonly ShowdownComparison[];
}
