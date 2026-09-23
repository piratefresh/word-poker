/**
 * betting.ts — the betting-round machine (§15, §22, §23, §31): whose turn it is, what is
 * legal, and when a round closes.
 *
 * Pure and stateless like the rest of the engine: the caller hands in the seats, the round's
 * numbers and the action, and gets back either the seats and the round the action leaves
 * behind — with the turn already moved, the reopen rule already applied, and the round's end
 * named — or a named refusal that changed nothing. No clock, no RNG, no I/O (AGENTS.md).
 *
 * Three conventions the rules leave implicit are pinned here:
 *
 * - **The big blind is the table's minimum bet** (§22, ADR 0004): the machine is handed the round
 *   already open — `startHand` posts the blinds before it deals (§5, §14) — and the floor it
 *   enforces is the big blind. The raise floor is `currentBet + max(lastRaiseSize, bigBlind)`,
 *   so on the first round, where the posted big blind is already the `currentBet`, the smallest
 *   raise is to two big blinds, and the first bet of every later round must reach one.
 * - **Amounts are raise-to round totals**, never increments (§22): `bet`'s and `raise`'s
 *   `amount` is what the seat's `committedRound` becomes.
 * - **A full raise reopens the action** to every other live seat; a short all-in that raises
 *   the current bet by less than the floor commits the chips but reopens nothing (§31), and
 *   `actedThisRound` is what remembers who may still raise.
 *
 * The machine does not know about streets, pots or words: it stops at `round-complete` and
 * lets the round machine roll the street (§15's three endings fall out of `nextActor`).
 */

import type {
  BettingAction,
  BettingRejectionReason,
  PlayerId,
} from "@wordpoker/contracts";

import { commitChips, type ChipSeat } from "./chips";

/**
 * The offline table's stakes: its blinds and the stack it seats every player on (§5, ADR 0002,
 * ADR 0004). Online rooms derive their blinds from the room buy-in instead.
 */
export const DEFAULT_STAKES = { smallBlind: 10, bigBlind: 20, startingStack: 1_000 } as const;

/** The betting settings a table fixes before it seats anyone. */
export interface Stakes {
  /** Posted before the deal by the first seat clockwise from the button (§5, §14). */
  smallBlind: number;
  /**
   * Posted before the deal by the next seat clockwise: the first round's opening Current Bet,
   * and the table's minimum bet — the floor for a later round's first voluntary bet, and half
   * of the raise floor. A raise-to must reach `currentBet + max(lastRaiseSize, bigBlind)`.
   */
  bigBlind: number;
}

/** One seat's chips plus where it stands in the hand — what the machine reads. */
export interface BettingSeatState extends ChipSeat {
  id: PlayerId;
  /** Surrendered the hand (§22); its committed chips stay in the pots (§25). */
  folded: boolean;
  /** Committed its whole stack; it has no further action (§22). */
  allIn: boolean;
  /** Not dealt into this hand — a busted Table Stack sitting the session out (ADR 0002). */
  sittingOut: boolean;
  /** Whether the seat has acted since the last full raise; reset by a reopen (§22). */
  actedThisRound: boolean;
}

/** The numbers a betting round is played by (§22, §23). */
export interface BettingRoundState {
  /** The highest amount committed by any live seat this round. */
  currentBet: number;
  /** The increment of the last full raise — half of the raise floor. */
  lastRaiseSize: number;
}

/**
 * How a betting round stands after one action: still open, closed with every seat matched,
 * or over because only one seat is left (§15, §26).
 */
export type BettingStepStatus = "open" | "round-complete" | "hand-over";

/** One action's outcome: the table it leaves behind and whose turn is next. */
export interface BettingStep<Seat extends BettingSeatState = BettingSeatState> {
  seats: readonly Seat[];
  round: BettingRoundState;
  /** The seat to act next; `null` once the round has closed or the hand is over. */
  toAct: number | null;
  status: BettingStepStatus;
}

/** Either the step an action produced, or the reason it was refused with nothing changed. */
export type BettingApply<Seat extends BettingSeatState = BettingSeatState> =
  | { ok: true; step: BettingStep<Seat> }
  | { ok: false; reason: BettingRejectionReason };

/** What one seat may do, and the amounts its controls are bounded by. */
export interface BettingBounds {
  canFold: boolean;
  canCheck: boolean;
  canBet: boolean;
  canCall: boolean;
  canRaise: boolean;
  canAllIn: boolean;
  /** What a call would commit: `currentBet − committedRound`, floored at 0. */
  callAmount: number;
  /** The smallest legal raise-to: the raise floor (§22). */
  minRaiseTo: number;
  /** The largest raise-to the stack can cover: `committedRound + stack`. */
  maxRaiseTo: number;
  /** The table's minimum bet — its big blind, for a control that labels the opening bet. */
  bigBlind: number;
  /** The round's current bet, for a control that labels call and raise. */
  currentBet: number;
}

/** The raise floor: the current bet plus at least the last full raise's increment (§22). */
function raiseFloor(round: BettingRoundState, bigBlind: number): number {
  return round.currentBet + Math.max(round.lastRaiseSize, bigBlind);
}

/**
 * The first seat clockwise from `fromIndex` that still owes the round something: it has not
 * folded, is not all-in, is not sitting out, and either has not matched `currentBet` or has
 * not acted since the last full raise. `null` when every seat is settled — §15's "all
 * remaining seats have committed the same amount" and "all but one are all in" are both this
 * returning nothing.
 */
export function nextActor(
  seats: readonly BettingSeatState[],
  currentBet: number,
  fromIndex: number,
): number | null {
  const count = seats.length;

  for (let offset = 1; offset <= count; offset += 1) {
    const index = (fromIndex + offset) % count;
    const seat = seats[index];
    if (seat === undefined) continue;
    if (seat.folded || seat.allIn || seat.sittingOut) continue;
    if (seat.committedRound < currentBet || !seat.actedThisRound) return index;
  }

  return null;
}

/**
 * Applies one betting action to a round, or refuses it with a named reason and no state
 * change (§15, §22, §23, §31).
 *
 * Refusals are checked in a fixed order so a caller can rely on which reason a doubly-illegal
 * action gets: whose turn it is, then whether the seat is in the hand at all, then whether the
 * action fits the round.
 *
 * Generic over the seat shape so a caller that carries more than the betting state — the
 * offline machine's seats, with their private tiles — gets its own seats back from `step`,
 * not a stripped copy.
 */
export function applyBettingAction<Seat extends BettingSeatState>(
  seats: readonly Seat[],
  round: BettingRoundState,
  toAct: number,
  action: BettingAction,
  bigBlind: number,
): BettingApply<Seat> {
  const actor = seats[toAct];
  if (actor === undefined || actor.id !== action.playerId) {
    return { ok: false, reason: "not-your-turn" };
  }
  if (actor.folded) return { ok: false, reason: "already-folded" };
  if (actor.allIn) return { ok: false, reason: "already-all-in" };
  if (actor.sittingOut) return { ok: false, reason: "not-in-hand" };

  const { committedRound, stack } = actor;
  const { currentBet } = round;
  const floor = raiseFloor(round, bigBlind);
  const allInTo = committedRound + stack;

  /** Chips this action moves from the stack, already clamped to what the seat holds. */
  let commit = 0;
  /** Whether the seat surrendered the hand. */
  let folded = false;
  /** The round total the action raises the seat to, or `null` when it is not a raise. */
  let raiseTo: number | null = null;
  /** Whether that raise is full — the only kind that reopens the action (§31). */
  let fullRaise = false;

  switch (action.type) {
    case "fold":
      folded = true;
      break;

    case "check":
      if (committedRound !== currentBet) return { ok: false, reason: "check-facing-bet" };
      break;

    case "bet": {
      if (currentBet > 0) return { ok: false, reason: "bet-facing-bet" };
      if (action.amount < bigBlind) return { ok: false, reason: "below-min-bet" };
      if (action.amount > stack) return { ok: false, reason: "insufficient-stack" };
      commit = action.amount;
      raiseTo = action.amount;
      // The opening bet is a full raise by definition: it is the round's first increment.
      fullRaise = true;
      break;
    }

    case "call": {
      if (currentBet === committedRound) return { ok: false, reason: "no-bet-to-call" };
      // A stack that cannot cover the bet calls short and goes all in (§23); the call
      // changes nothing else — it is not a raise, so nothing reopens.
      commit = Math.min(currentBet - committedRound, stack);
      break;
    }

    case "raise": {
      // With no bet to raise, the opening move is a bet (§22). The refusal is named for the
      // bet the action looked for and did not find.
      if (currentBet === 0) return { ok: false, reason: "no-bet-to-call" };
      if (actor.actedThisRound) return { ok: false, reason: "action-closed" };
      if (action.amount < floor && action.amount !== allInTo) {
        return { ok: false, reason: "below-min-raise" };
      }
      if (action.amount > allInTo) return { ok: false, reason: "insufficient-stack" };

      commit = action.amount - committedRound;
      // A raise short of the floor can only be the seat's whole stack (§31): it moves the
      // round total like any all-in, but it reopens nothing.
      if (action.amount > currentBet) {
        raiseTo = action.amount;
        fullRaise = action.amount >= floor;
      }
      break;
    }

    case "allIn": {
      commit = stack;
      if (allInTo > currentBet) {
        raiseTo = allInTo;
        fullRaise = allInTo >= floor;
      }
      break;
    }

    default: {
      // The union is closed; a caller that fed the machine untyped data is told rather than
      // leaving with an action silently applied as a no-op.
      const unhandled: never = action;
      throw new Error(`unknown betting action: ${JSON.stringify(unhandled)}`);
    }
  }

  const committed = commitChips(actor, commit);
  const nextSeats = [...seats];
  nextSeats[toAct] = {
    ...actor,
    stack: committed.seat.stack,
    committedRound: committed.seat.committedRound,
    committedHand: committed.seat.committedHand,
    folded,
    allIn: committed.seat.stack === 0,
    actedThisRound: true,
  };

  // The reopen rule (§22, §31): a full raise puts every other live seat back on the hook,
  // because the amount they matched is no longer the current bet. A short all-in raise moves
  // the current bet but leaves `lastRaiseSize` alone and reopens nobody.
  if (fullRaise) {
    for (let index = 0; index < nextSeats.length; index += 1) {
      const seat = nextSeats[index];
      if (index === toAct || seat === undefined) continue;
      if (!seat.folded && !seat.allIn && !seat.sittingOut) {
        nextSeats[index] = { ...seat, actedThisRound: false };
      }
    }
  }

  const nextRound: BettingRoundState =
    raiseTo === null
      ? round
      : { currentBet: raiseTo, lastRaiseSize: fullRaise ? raiseTo - currentBet : round.lastRaiseSize };

  // §26: one seat left in the hand ends it, whatever the round still owed.
  let live = 0;
  for (const seat of nextSeats) {
    if (!seat.folded && !seat.sittingOut) live += 1;
  }
  if (live === 1) {
    return { ok: true, step: { seats: nextSeats, round: nextRound, toAct: null, status: "hand-over" } };
  }

  const next = nextActor(nextSeats, nextRound.currentBet, toAct);
  if (next === null) {
    return { ok: true, step: { seats: nextSeats, round: nextRound, toAct: null, status: "round-complete" } };
  }

  return { ok: true, step: { seats: nextSeats, round: nextRound, toAct: next, status: "open" } };
}

/**
 * What one seat may legally do right now, or `null` when it cannot act at all — folded,
 * all-in, or sitting out. The flags are enablement, not advice: a control is enabled iff the
 * engine would accept that action.
 *
 * `minRaiseTo` stays the floor even when the stack cannot reach it (`canRaise` is then
 * false); `maxRaiseTo` is what the stack can actually make the round total.
 */
export function bettingBounds(
  seats: readonly BettingSeatState[],
  round: BettingRoundState,
  seatIndex: number,
  bigBlind: number,
): BettingBounds | null {
  const seat = seats[seatIndex];
  if (seat === undefined || seat.folded || seat.allIn || seat.sittingOut) return null;

  const maxRaiseTo = seat.committedRound + seat.stack;

  return {
    canFold: true,
    canCheck: seat.committedRound === round.currentBet,
    canBet: round.currentBet === 0 && seat.stack >= bigBlind,
    canCall: seat.committedRound < round.currentBet,
    canRaise:
      round.currentBet > 0 && !seat.actedThisRound && maxRaiseTo >= raiseFloor(round, bigBlind),
    canAllIn: seat.stack > 0,
    callAmount: Math.max(0, round.currentBet - seat.committedRound),
    minRaiseTo: raiseFloor(round, bigBlind),
    maxRaiseTo,
    bigBlind,
    currentBet: round.currentBet,
  };
}
