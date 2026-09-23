/**
 * word-rejection-copy.ts — §11's refusal reasons as a seat reads them.
 *
 * The `Record` is exhaustive on purpose: a reason added to the contract becomes a compile error
 * here rather than a blank line on screen. None of the copy is the wire string — `too-long`
 * names a branch in the engine, not something to hand a player.
 *
 * It lives in `lib/` rather than beside one of its readers because two surfaces say the same
 * sentence: the word builder's line while the seat is still shaping its word (§11's own moment),
 * and the results card's word slot for a seat that reached the reveal with nothing. One table,
 * because two copies of one sentence drift apart without a test noticing.
 */

import type { WordRejectionReason } from "@wordpoker/contracts";

export const WORD_REJECTION_COPY: Record<WordRejectionReason, string> = {
  "empty-submission": "Play a tile before confirming",
  "too-short": "A word needs at least two letters",
  "too-long": "More letters than the tiles can spell",
  "uses-unavailable-letters": "Those letters are not in your tiles",
  "tile-reused": "Each tile plays once",
  "not-in-dictionary": "Not in the dictionary",
  "timer-expired": "The window closed",
};
