/**
 * chips.ts — the per-seat money model (§22, §24): what a seat may bet, what it has put in,
 * and how it gets paid.
 *
 * The only balance a hand can move is the **Table Stack**; chips never enter or leave the
 * table mid-hand, so a commit is a transfer from the stack into the round's commit counters
 * and an award is chips coming back. Both helpers are pure and return new seats — the
 * betting machine rebuilds its seat array on every action, and a shared mutable seat would
 * let one branch of a replay see another's commitment.
 *
 * No clock, no RNG, no I/O (AGENTS.md): the amounts are handed in by the machine, which is
 * where the rules that produced them live.
 */

/** One seat's chips: what it holds, and what it has committed to the hand. */
export interface ChipSeat {
  /** Chips still in front of the seat — what it may bet (§22). */
  stack: number;
  /** Chips committed this betting round; reset when the street rolls. */
  committedRound: number;
  /** Chips committed this hand — what the pots are built from (§25). */
  committedHand: number;
}

/** What one commit did: the seat after it, and whether it emptied the stack. */
export interface CommitResult {
  /** The seat with the chips moved and both counters advanced. */
  seat: ChipSeat;
  /** How many chips actually moved — at most the stack, never negative. */
  committed: number;
  /** Whether the commit took the seat's whole stack (§22, all-in). */
  wentAllIn: boolean;
}

/**
 * Moves up to `amount` chips from the stack into both commit counters (§22). The amount is
 * capped at what the seat holds — committing more than the stack is not an error to the
 * money model but the definition of an all-in — and a zero or negative amount is a no-op,
 * so a caller that computed "nothing to add" cannot move chips by accident.
 */
export function commitChips(seat: ChipSeat, amount: number): CommitResult {
  const committed = Math.max(0, Math.min(amount, seat.stack));
  const stack = seat.stack - committed;

  return {
    seat: {
      stack,
      committedRound: seat.committedRound + committed,
      committedHand: seat.committedHand + committed,
    },
    committed,
    wentAllIn: stack === 0,
  };
}

/**
 * Adds winnings to the Table Stack (§24). Stacks are uncapped after joining, so this is a
 * plain addition — the pot that lands here was already committed, and a seat that wins it
 * can end a hand richer than it sat down with.
 *
 * Generic over the seat shape so a caller that carries more than the chips — the betting
 * machine's seats, with their flags — gets its own seat type back, not a stripped one.
 */
export function awardChips<Seat extends ChipSeat>(seat: Seat, amount: number): Seat {
  return { ...seat, stack: seat.stack + amount };
}
