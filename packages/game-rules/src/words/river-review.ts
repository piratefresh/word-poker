/**
 * river-review.ts — §44's River Review: the three best words a seat could have played, read off
 * the settled hand. Never used mid-hand; whoever holds it gets it at the payout, folded or not.
 */

import type { PlayerId } from "@wordpoker/contracts";

import { topWords, type BotWord } from "../bot/bot-word";
import { availableTiles, type OfflineState } from "../table/offline";

/** How many words River Review shows. */
export const RIVER_REVIEW_WORDS = 3;

/**
 * The seat's best words from its private tiles and the board, or `null` when the hand has not
 * paid out or the seat does not hold River Review. Spotlight's double is already on the board.
 */
export function riverReview(state: OfflineState, playerId: PlayerId): BotWord[] | null {
  if (state.phase !== "payout" || state.powers?.held[playerId]?.id !== "river_review") return null;
  const seat = state.seats.findIndex((candidate) => candidate.id === playerId);
  if (seat < 0) return null;

  return topWords({ available: availableTiles(state, seat), dictionary: state.dictionary }, RIVER_REVIEW_WORDS);
}
