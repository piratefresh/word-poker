/**
 * bot.ts — the offline opponent: the same legal move, every turn.
 *
 * Deliberately trivial (STO-284 guardrails): with no betting in this slice, the only
 * legal offline action is to progress the round, so the bot does exactly that — it
 * passes its turn, and the last seat's pass rolls the street. It reads no clock and no
 * random source, so the same state always produces the same move.
 *
 * Extension point: STO-271 ("Deterministic tutorial and offline bots") replaces the body
 * of `decideOfflineMove` with the heuristic search — tile fit, word potential, bet
 * sizing, and a seed for tie-breaks. Keep the signature and the legality contract; swap
 * the policy.
 */

import type { OfflineAction, PlayerId } from "@wordpoker/contracts";

import { OfflineActionError, type OfflineState } from "./offline";

/**
 * What `botId` plays on its turn.
 *
 * At `payout` the hand is over and there is no turn left, so the only move that keeps the
 * table moving is a fresh deal. During §19's word window there is no turn at all — the bots
 * confirm words of their own, which STO-305 gives them — so asking is a caller bug that gets
 * named rather than silently answered. Everywhere else the bot passes its turn, which is what
 * walks the round.
 *
 * Throws when the bot is not the seat to act — a caller that skipped the turn order has a
 * bug, and a move applied out of turn would desync the table silently.
 */
export function decideOfflineMove(state: OfflineState, botId: PlayerId): OfflineAction {
  if (state.phase === "payout") return { type: "deal" };

  // The window is shared and has no seat to act, so a bot that is asked for one has nothing
  // to answer with: its slot runs out with the clock, like any seat that never confirmed.
  if (state.wordWindow?.status === "open") {
    throw new OfflineActionError(`${botId} has no word to play: the table is in its word window`);
  }

  const acting = state.toActIndex === null ? undefined : state.seats[state.toActIndex];
  if (acting === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  if (acting.id !== botId) {
    throw new OfflineActionError(`${botId} is not to act at ${state.phase}; ${acting.id} is`);
  }

  return { type: "advance" };
}
