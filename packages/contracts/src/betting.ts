/**
 * Betting on the wire: what a seat can be told to do with its chips, what a seat may show
 * about them, and the reasons a betting action can be refused
 * (docs/rules/betting-and-pots.md §22–§26).
 *
 * Every action names its seat for the same reason a word action does: who is acting is a
 * claim the engine checks against the state, never an authority the payload carries. An
 * action that is well formed is not necessarily legal — that is the engine's answer, and it
 * arrives as a {@link BettingRejectionReason}.
 *
 * Amounts are **round totals, not increments**: `bet`'s and `raise`'s `amount` are the
 * number of chips the seat will have committed to the round *after* the action — a raise-to,
 * as §22's raise slider states it — so the engine never has to guess which reading a client
 * meant.
 */

import type { PlayerId } from "./players";
import type { ShowdownRanking } from "./showdown";

/** Every betting action the engine understands, in the order §15 lists them. */
export const BETTING_ACTIONS = ["fold", "check", "bet", "call", "raise", "allIn"] as const;

/** Which betting action an untyped payload claims to be. */
export type BettingActionType = (typeof BETTING_ACTIONS)[number];

/** One seat's action in a betting round, as it crosses the socket. */
export type BettingAction =
  /** Surrender the pot; the seat's committed chips stay in (§22). */
  | { type: "fold"; playerId: PlayerId }
  /** Pass when nothing is owed — illegal while facing a bet (§15). */
  | { type: "check"; playerId: PlayerId }
  /** Open the round with a bet: `amount` is the round total the seat will hold (§22). */
  | { type: "bet"; playerId: PlayerId; amount: number }
  /** Match the current bet; a stack that cannot cover it calls short and goes all in (§23). */
  | { type: "call"; playerId: PlayerId }
  /** Raise to `amount` — the round total the seat will hold, not the increment (§22). */
  | { type: "raise"; playerId: PlayerId; amount: number }
  /** Commit the seat's exact remaining Table Stack (§22). */
  | { type: "allIn"; playerId: PlayerId };

/** Whether an untrusted value is a seat id. */
function isSeatId(value: unknown): value is PlayerId {
  return typeof value === "string" && value.length > 0;
}

/** Whether an untrusted value is a chip count: a non-negative integer. */
function isChipCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether an untrusted value is a structurally valid betting action — what a socket handler
 * checks before the payload reaches the engine, and all it needs to check. Legality (whose
 * turn it is, what is owed, whether the stack covers it) is the engine's answer.
 */
export function isBettingAction(value: unknown): value is BettingAction {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  if (!("playerId" in value) || !isSeatId(value.playerId)) {
    return false;
  }

  switch (value.type) {
    case "bet":
    case "raise":
      return "amount" in value && isChipCount(value.amount);
    case "fold":
    case "check":
    case "call":
    case "allIn":
      return true;
    default:
      return false;
  }
}

/**
 * Every way a betting action can be refused, from §15, §22, §23 and §31.
 *
 * A string union rather than numbers, for the same reason as §11's word reasons: these cross
 * the wire into logs and UI copy, and reordering them can never renumber a reason a client
 * already understands.
 */
export const BETTING_REJECTION_REASONS = [
  /** The seat is not the one to act (§15). */
  "not-your-turn",
  /** The seat is sitting out this hand — its Table Stack is busted (§27). */
  "not-in-hand",
  /** The seat has already surrendered this hand (§22). */
  "already-folded",
  /** The seat has committed its whole stack; it has no action left (§22). */
  "already-all-in",
  /** There is no round to bet in: the hand is in §19's window or has paid out. */
  "hand-over",
  /** Check is illegal while facing a bet (§15). */
  "check-facing-bet",
  /** There is nothing to call: the seat has already matched the current bet. */
  "no-bet-to-call",
  /** Betting is illegal once the round has a current bet — that is a raise (§15, §22). */
  "bet-facing-bet",
  /** A first bet below the table's minimum bet — its big blind (§22). */
  "below-min-bet",
  /** A raise smaller than the raise floor — unless it is a short all-in (§31). */
  "below-min-raise",
  /** The amount needs more chips than the seat's Table Stack holds (§22). */
  "insufficient-stack",
  /** The seat has already acted since the last full raise; action is not reopened to it (§22). */
  "action-closed",
  /** The server synthesized an action because this seat's turn clock expired (STO-395). */
  "turn-timeout",
] as const;

/** Why a betting action was refused. */
export type BettingRejectionReason = (typeof BETTING_REJECTION_REASONS)[number];

/** One seat's chips, as a client may show them (§22). */
export interface SeatChips {
  /** What the seat may still bet this hand — the Table Stack (§22). */
  readonly tableStack: number;
  /** Chips committed this betting round. */
  readonly committedThisRound: number;
  /** Chips committed this hand — what the pots are built from (§25). */
  readonly committedThisHand: number;
  /** Whether the seat committed its whole stack (§22). */
  readonly isAllIn: boolean;
  /** Whether the seat surrendered the hand (§22). */
  readonly hasFolded: boolean;
}

/** The round's numbers, as the felt states them (§22). */
export interface RoundChips {
  /**
   * The round's floor: the table's minimum bet, which is its big blind (§22, §5). Every later
   * round's first bet must reach it, and the raise floor is built from it.
   */
  readonly bigBlind: number;
  /** The highest amount committed by any live seat this round (§23). */
  readonly currentBet: number;
  /** The raise increment floor; a raise-to is `currentBet + minRaise` (§22). */
  readonly minRaise: number;
}

/** One pot's settlement, as the reveal renders it (§25, §26). */
export interface PotResult {
  /** The chips in the pot. */
  readonly amount: number;
  /** The seats that could win it — in the hand and committed at least the pot's level. */
  readonly eligible: readonly PlayerId[];
  /** The seats that took it; more than one only when an unbroken tie was split. */
  readonly winners: readonly PlayerId[];
  /** The ranking that decided it, or `null` for a fold-out — no contest, no reveal (§26). */
  readonly ranking: ShowdownRanking | null;
}

/** One seat's chips before and after a hand settled (§24). */
export interface StackDelta {
  readonly playerId: PlayerId;
  /** The seat's Table Stack when the hand was dealt, before any commitment. */
  readonly start: number;
  /** The seat's Table Stack once the pots were awarded. */
  readonly end: number;
}

/** What one hand's settlement did: every pot's outcome and every seat's net (§25). */
export interface PayoutResult {
  /** Ascending: the main pot first, side pots after. */
  readonly pots: readonly PotResult[];
  /** One per seat dealt into the hand. */
  readonly stackDeltas: readonly StackDelta[];
}
