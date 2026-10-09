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
  preflop: "PREFLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
  payout: "PAYOUT",
};

/**
 * The ordinal the header stamp shows, e.g. the `4` in `TURN`.
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
  | { state: "signed-out" }
  | { state: "free-play" };

/**
 * Offline and the tutorial are free play (ADR 0002): no Wallet behind the table, just a fixed
 * local Table Stack. The modes pass this shared constant so each states its economy explicitly
 * rather than the felt guessing one.
 */
export const FREE_PLAY: BalanceView = { state: "free-play" };

/**
 * Whether the header hangs the table's mode under the phase capsule, rather than keeping it in
 * the corner group beside the readouts.
 *
 * Only a free-play table has a mode to name, and only a portrait bar has the column for the
 * tag: a landscape bar has the width to keep it beside the clock, and its middle seat is drawn
 * right under the capsule. Both the bar and whatever hangs below it (the room's seats) ask
 * here, so the tag and the room it hangs into cannot disagree.
 */
export function hangsModeTag(
  balance: BalanceView,
  window: { width: number; height: number },
): boolean {
  return balance.state === "free-play" && window.height >= window.width;
}
