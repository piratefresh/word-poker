/**
 * offline.ts — the offline round engine: one hand, no server, no betting.
 *
 * A pure state machine (AGENTS.md): the seed and the clock are injected, so the same
 * seed and the same action sequence always produce the same hand. `advance` passes the
 * turn to the next seat; the last seat's turn rolls the street — `preflop → flop → turn
 * → river → payout` — revealing 0/3/4/5 community tiles on the way. Past `payout` the
 * next `deal` (or `advance`) rolls into a fresh hand whose seed is derived from the one
 * before, so a table's whole run replays from the seed it started with.
 *
 * Betting, word building, and scoring are deliberately absent: this slice walks the
 * round and nothing else. Betting lands with the real table, word scoring with the
 * dictionary.
 */

import {
  ROUND_PHASES,
  type OfflineAction,
  type PlayerId,
  type RoundPhase,
  type Tile,
} from "@wordpoker/contracts";

import { dealHand } from "./deal";

/**
 * How long a seat's turn lasts on the injected clock. The server gives a betting round
 * 30 seconds, so an offline turn is handed the same budget.
 */
export const OFFLINE_TURN_MS = 30_000;

/**
 * How many community tiles each phase has face up. E5 deals the whole five-tile board
 * up front; the streets only change how much of it is showing.
 */
const REVEALED_BY_PHASE: Readonly<Record<RoundPhase, number>> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  payout: 5,
};

/** A seated player and the private tiles the deal gave them. */
export interface OfflineSeat {
  id: PlayerId;
  privateTiles: readonly Tile[];
}

/** The whole offline table: one hand's deal, the street it is on, and whose turn it is. */
export interface OfflineState {
  /** Which hand this is, 1-based. */
  hand: number;
  /** The seed the current hand was dealt from; the next hand derives from it. */
  seed: number;
  phase: RoundPhase;
  /** Seat order, first to act first. */
  seats: readonly OfflineSeat[];
  /** All five community tiles, dealt up front; `revealed` says how many are face up. */
  community: readonly Tile[];
  /** How many of `community` are face up (0/3/4/5). */
  revealed: number;
  /** The seat to act, by index into `seats`; `null` once the hand has paid out. */
  toActIndex: number | null;
  /** When the current turn's clock runs out, on the caller's timeline. */
  endsAtMs: number;
}

/** What `startHand` needs: a seed, the seats, and the caller's clock reading. */
export interface StartHandOptions {
  seed: number;
  players: readonly PlayerId[];
  nowMs: number;
}

/**
 * An action that does not fit the state it was handed — dealing mid-hand, or acting on a
 * hand that has already paid out. Named so a caller can tell an engine refusal from a
 * programming error, and the message names the phase it refused at.
 */
export class OfflineActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineActionError";
  }
}

/** How many community tiles the phase has face up. */
export function revealedCount(phase: RoundPhase): number {
  return REVEALED_BY_PHASE[phase];
}

/**
 * Deals a fresh hand and puts the first seat on the clock. Everything the round needs is
 * fixed here: the whole board, both private tiles per seat, and the hand's seed.
 */
export function startHand({ seed, players, nowMs }: StartHandOptions): OfflineState {
  const dealt = dealHand({ seed, playerCount: players.length });

  return {
    hand: 1,
    seed,
    phase: "preflop",
    // `?? []` is unreachable — the deal gives every seat a hand — but the seat index is
    // optional under `noUncheckedIndexedAccess`, so it is spelled out rather than cast.
    seats: players.map((id, seat) => ({ id, privateTiles: dealt.privateTiles[seat] ?? [] })),
    community: dealt.community,
    revealed: revealedCount("preflop"),
    toActIndex: 0,
    endsAtMs: nowMs + OFFLINE_TURN_MS,
  };
}

/**
 * Applies one action. `nowMs` is the caller's clock reading, used only to arm the next
 * turn's deadline — nothing here reads a clock of its own.
 */
export function reduce(state: OfflineState, action: OfflineAction, nowMs: number): OfflineState {
  if (action.type === "deal") {
    if (state.phase !== "payout") {
      throw new OfflineActionError(
        `deal is only legal once the hand has paid out; the table is at ${state.phase}`,
      );
    }
    return nextHand(state, nowMs);
  }

  // A paid-out hand has no turn left to pass, so `advance` rolls the next hand instead.
  if (state.phase === "payout") return nextHand(state, nowMs);

  return advanceTurn(state, nowMs);
}

/** Passes the turn to the next seat, or rolls the street when the last seat has acted. */
function advanceTurn(state: OfflineState, nowMs: number): OfflineState {
  if (state.toActIndex === null) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }

  const nextIndex = state.toActIndex + 1;
  if (nextIndex < state.seats.length) {
    return { ...state, toActIndex: nextIndex, endsAtMs: nowMs + OFFLINE_TURN_MS };
  }

  const phase = nextPhase(state.phase);
  return {
    ...state,
    phase,
    revealed: revealedCount(phase),
    // Payout has nobody left to act: the hand is over and waits for a deal.
    toActIndex: phase === "payout" ? null : 0,
    endsAtMs: nowMs + OFFLINE_TURN_MS,
  };
}

/** The street after this one. `payout` is the last, and `advanceTurn` never asks past it. */
function nextPhase(phase: RoundPhase): RoundPhase {
  const next = ROUND_PHASES[ROUND_PHASES.indexOf(phase) + 1];
  if (next === undefined) {
    throw new OfflineActionError(`the payout round has no next street`);
  }
  return next;
}

/**
 * The hand after this one. A fresh deal from a seed derived from the hand before
 * (`seed + hand`), so the run stays reproducible without ever reshuffling tiles that
 * were already on the felt.
 */
function nextHand(state: OfflineState, nowMs: number): OfflineState {
  const fresh = startHand({
    seed: state.seed + state.hand,
    players: state.seats.map((seat) => seat.id),
    nowMs,
  });

  return { ...fresh, hand: state.hand + 1 };
}
