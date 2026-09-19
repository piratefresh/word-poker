/**
 * hud-types.ts — the presentational vocabulary of the in-hand HUD.
 *
 * The HUD owns no game state. Everything here is a view model: the caller (the
 * game screen, or a screen fixture) normalizes its own state into these shapes, and
 * the HUD only decides how they look.
 */

import type { RoundPhase } from "@wordpoker/contracts";

/** Phase wording as the table names it, not as the engine stores it. */
export const PHASE_LABEL: Record<RoundPhase, string> = {
  preflop: "PRE-FLOP",
  flop: "THE FLOP",
  turn: "THE TURN",
  river: "THE RIVER",
  payout: "PAYOUT",
};

/**
 * The ordinal the header stamp shows, e.g. the `4` in `PHASE 4 · THE TURN`.
 *
 * Pre-flop is 2, not 1: the design's flop screen reads `PHASE 3` and its turn screen
 * reads `PHASE 4`, which only agree if something precedes pre-flop. Named here so the
 * screens share one answer instead of each writing `index + 2`.
 */
export const PHASE_NUMBER: Record<RoundPhase, number> = {
  preflop: 2,
  flop: 3,
  turn: 4,
  river: 5,
  payout: 6,
};

/**
 * The coin balance is not always known, and each way of not knowing reads
 * differently to a player. A single nullable number would collapse "still
 * loading" into "you have nothing", which is the one thing it must not say.
 */
export type BalanceView =
  | { state: "ready"; amount: number }
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "signed-out" };
