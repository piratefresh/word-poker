/**
 * The betting rounds a hand moves through, in order. The clock takes a table from one to
 * the next; past the last it deals a fresh hand back at the first.
 */
export const ROUND_PHASES = ["preflop", "flop", "turn", "river", "payout"] as const;

/** One of the five rounds of a hand. */
export type RoundPhase = (typeof ROUND_PHASES)[number];

/** A table with seats still to fill: it precedes the cycle and is not part of it. */
export const WAITING_PHASE = "waiting";

/** Every value a table's `phase` can hold — the waiting room, then the hand's rounds. */
export type RoomPhase = RoundPhase | typeof WAITING_PHASE;

/** Whether an untrusted value — a table's published status, read off a socket — is a phase. */
export function isRoomPhase(value: unknown): value is RoomPhase {
  return value === WAITING_PHASE || (ROUND_PHASES as readonly unknown[]).includes(value);
}
