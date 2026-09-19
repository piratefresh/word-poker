/**
 * use-offline-game.ts — the offline adapter: engine state in, `GameScreenState` out.
 *
 * This is the thin seam between `@wordpoker/game-rules` (which knows nothing about
 * screens) and the existing `GameScreen` (which knows nothing about the engine). It owns
 * one `OfflineState`, runs the fixed bot on the bots' turns, computes the winner at
 * payout, and maps the whole thing into the shape the felt already renders.
 *
 * Deliberately minimal: `deal()`, `advance()`, and the mapped state. The general form of
 * this — selectors, an animation-event stream, adapter lifecycle, and a source that can
 * be swapped between offline, tutorial, and the online room — is STO-277's store, and is
 * where this goes when the second adapter needs it.
 *
 * No server, no socket, no import from either: the screen this feeds has to work with the
 * server stopped and the device in airplane mode.
 */

import { useCallback, useMemo, useState } from "react";

import type { PlayerId } from "@wordpoker/contracts";
import {
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  decideOfflineMove,
  pickWinner,
  reduce,
  scoreHand,
  startHand,
  type OfflineSeat,
  type OfflineState,
} from "@wordpoker/game-rules";

import { PHASE_NUMBER } from "@/components/hud";
import type {
  GamePlayer,
  GameScreenState,
  PlayerStatus,
} from "@/components/screens/game/game-types";
import { isSupportedSeatCount, type SeatCount } from "@/components/table";
import { colors, palette } from "@/constants/theme";

/**
 * The seed a table starts from when the caller does not pick one. Fixed, so the offline
 * slice is the same hand on every device — a later story can seed it per player.
 */
export const OFFLINE_SEED = 20_260_919;

/** The hero always sits in this seat; the bots fill the rest, and act after them. */
const HERO_ID: PlayerId = "hero";

/**
 * The slice's roster. Names are fixed: there is no lobby and nobody to invite yet.
 *
 * The hero is a guest rather than "You" because the felt prints its own "· YOU" badge
 * beside the name of whoever holds `isHero` — naming the seat that same word would put
 * it on the felt twice.
 */
const ROSTER: readonly { id: PlayerId; name: string; initials: string }[] = [
  { id: HERO_ID, name: "Guest", initials: "GU" },
  { id: "ellis", name: "Ellis", initials: "EL" },
  { id: "jay", name: "Jay", initials: "JA" },
  { id: "mira", name: "Mira", initials: "MI" },
];

/**
 * No wallet, no blinds, and no betting in this slice, so the stack a seat shows is the
 * table's buy-in and never moves. It is here because a seat without a stack is not a
 * seat; it is not here because anything can win it.
 */
const NOMINAL_STACK = 1_000;

/** The betting controls, in their offline shape: present, and refusing every press. */
const NO_BETS = {
  minRaise: 0,
  maxRaise: 0,
  raiseStep: 0,
  raiseAmount: 0,
  canFold: false,
  canCheck: false,
  canRaise: false,
} as const;

export interface OfflineGame {
  /** The mapped state: exactly what `GameScreen` renders. */
  game: GameScreenState;
  /** Starts the next hand. Only legal once the current hand has paid out. */
  deal: () => void;
  /**
   * Passes the hero's turn — or, while §19's word window is open, closes the window with the
   * clock run out. The bots take their turns on their own.
   */
  advance: () => void;
}

/**
 * Owns the offline hand. A turn that belongs to a bot resolves inside the same state
 * transition that reached it, so the table never sits waiting on a seat that has nobody
 * behind it — the hero taps once per street and watches the board fill.
 */
export function useOfflineGame({ seed = OFFLINE_SEED }: { seed?: number } = {}): OfflineGame {
  const [state, setState] = useState<OfflineState>(() =>
    startHand({ seed, players: ROSTER.map((player) => player.id), nowMs: Date.now() }),
  );

  const apply = useCallback((action: "deal" | "advance") => {
    setState((current) => {
      // §19's window is shared and has no turn to pass: a tap during it means the table is
      // done building, so the slice runs the clock to the window's deadline and lets the
      // timeout rule settle it — every seat that never confirmed is out of time. The word
      // builder itself is STO-304/STO-305, and it will replace this.
      if (current.wordWindow?.status === "open") {
        return reduce(current, { type: "timeoutWords" }, current.endsAtMs);
      }

      const next = reduce(current, { type: action }, Date.now());
      return resolveBotTurns(next);
    });
  }, []);

  const deal = useCallback(() => apply("deal"), [apply]);
  const advance = useCallback(() => apply("advance"), [apply]);

  return { game: useMemo(() => toScreenState(state), [state]), deal, advance };
}

/** Passes every consecutive bot turn, stopping at the hero, at §19's window, or at payout. */
function resolveBotTurns(state: OfflineState): OfflineState {
  let next = state;

  while (next.phase !== "payout") {
    const acting = actingSeat(next);
    if (acting === undefined || acting.id === HERO_ID) return next;
    next = reduce(next, decideOfflineMove(next, acting.id), Date.now());
  }

  return next;
}

function actingSeat(state: OfflineState): OfflineSeat | undefined {
  return state.toActIndex === null ? undefined : state.seats[state.toActIndex];
}

/**
 * Everything the felt needs, mapped off the engine state.
 *
 * `secondsRemaining` is the turn's full budget rather than `endsAtMs` minus now: the HUD
 * holds a budget for the length of a turn and runs it down itself, and a value that
 * changed every second would land on a new turn key every second and restart the
 * countdown instead of counting it. The state's own deadline stays authoritative for
 * whoever advances an expired turn.
 */
function toScreenState(state: OfflineState): GameScreenState {
  const hero = state.seats.find((seat) => seat.id === HERO_ID);
  const winner = state.phase === "payout" ? winnerOf(state) : null;

  return {
    // One turn, one identity: the HUD re-anchors its countdown when this changes, so it
    // has to name the seat and the street, not just the hand.
    id: `offline-${state.hand}-${state.phase}-${state.toActIndex ?? state.wordWindow?.status ?? "done"}`,
    phase: state.phase,
    phaseNumber: PHASE_NUMBER[state.phase],
    secondsRemaining: (state.wordWindow?.status === "open" ? WORD_WINDOW_MS : OFFLINE_TURN_MS) / 1_000,
    seatCount: toSeatCount(state.seats.length),
    players: state.seats.map((seat, index) => player(seat, index, state, winner)),
    pot: 0,
    community: state.community.map((tile, index) => (index < state.revealed ? tile : null)),
    privateTiles: hero?.privateTiles ?? [],
    bestScore: winner?.score,
    betting: NO_BETS,
  };
}

/** Everyone's standing at payout, and who it awards. */
function winnerOf(state: OfflineState): { id: PlayerId; score: number } {
  const standings = state.seats.map((seat, index) => ({
    id: seat.id,
    score: scoreHand(seat.privateTiles, state.community),
    seat: index,
  }));
  const id = pickWinner(standings);

  return { id, score: standings.find((entry) => entry.id === id)?.score ?? 0 };
}

function player(
  seat: OfflineSeat,
  index: number,
  state: OfflineState,
  winner: { id: PlayerId } | null,
): GamePlayer {
  return {
    id: seat.id,
    name: ROSTER[index]?.name ?? seat.id,
    initials: ROSTER[index]?.initials ?? seat.id.slice(0, 2).toUpperCase(),
    // The felt badges this seat "· YOU" and the HUD names it in the spoken turn phrase;
    // without the flag the offline table never says which seat is the player's.
    isHero: seat.id === HERO_ID,
    stack: NOMINAL_STACK,
    color: colors.players[index % colors.players.length] ?? palette.amber400,
    status: seatStatus(seat, state, winner),
  };
}

function seatStatus(
  seat: OfflineSeat,
  state: OfflineState,
  winner: { id: PlayerId } | null,
): PlayerStatus {
  if (winner !== null) return winner.id === seat.id ? "winner" : "waiting";
  if (actingSeat(state)?.id !== seat.id) return "waiting";

  return seat.id === HERO_ID ? "your-turn" : "thinking";
}

/**
 * The felt only draws the seat counts it supports, so a roster it cannot seat is a bug
 * worth hearing about rather than a table that silently drops a player.
 */
function toSeatCount(count: number): SeatCount {
  if (!isSupportedSeatCount(count)) {
    throw new Error(`the offline table seats ${count} players; the felt supports 4 to 6`);
  }
  return count;
}
