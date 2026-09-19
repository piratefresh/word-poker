/**
 * offline.ts — the offline round engine: one hand, no server, no betting.
 *
 * A pure state machine (AGENTS.md): the seed and the clock are injected, so the same seed and
 * the same action sequence always produce the same hand. `advance` passes the turn to the
 * next seat; the last seat's turn rolls the street — `preflop → flop → turn → river` —
 * revealing 0/3/4/5 community tiles on the way. When the river closes, §19's word window
 * opens instead of the payout: every seat drafts and confirms a word on one shared
 * sixty-second clock, and the hand pays out once every seat has confirmed or run out of time.
 * Past the payout, the next `deal` (or `advance`) rolls into a fresh hand whose seed is
 * derived from the one before, so a table's whole run replays from the seed it started with.
 *
 * Betting and scoring are deliberately absent: this slice walks the round and the word
 * window, and nothing else. Betting lands with the real table, scoring with the dictionary —
 * so a seat's confirmed word is checked here for whether it can be *built* (§10–§12), never
 * for whether it is a word (§11) or what it is worth (§7).
 */

import {
  ROUND_PHASES,
  type OfflineAction,
  type PlayerId,
  type RoundPhase,
  type Tile,
  type WordRejectionReason,
  type WordSubmission,
} from "@wordpoker/contracts";

import { resolveSubmission } from "./building";
import { dealHand } from "./deal";

/**
 * How long a seat's turn lasts on the injected clock. The server gives a betting round
 * 30 seconds, so an offline turn is handed the same budget.
 */
export const OFFLINE_TURN_MS = 30_000;

/**
 * How long §19's word window stays open. One clock for the whole table: the rules give the
 * seats sixty seconds between them, not sixty each.
 */
export const WORD_WINDOW_MS = 60_000;

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

/**
 * One seat's slot in §19's window: the word it is working on, the word it committed to, or
 * the fact that its time ran out with no confirmed word — which §11 scores as 0 points.
 */
export type WordSlot =
  | {
      readonly playerId: PlayerId;
      /** What the seat has typed so far; `null` until it drafts anything. Editable. */
      readonly status: "drafting";
      readonly draft: WordSubmission | null;
    }
  | {
      readonly playerId: PlayerId;
      /** The word the seat confirmed. A confirmed word is locked and never replaced. */
      readonly status: "confirmed";
      readonly submission: WordSubmission;
    }
  | {
      readonly playerId: PlayerId;
      /** The window closed with nothing confirmed: this seat has no word (§11). */
      readonly status: "timed-out";
    };

/**
 * §19's word window (§19, `docs/rules/hand-flow.md`).
 *
 * `slots` is index-aligned with `seats` — one slot per seat, in seat order — which is what
 * lets the window hand a seat its own tiles without searching for it. The settled window
 * stays in the state: it is the record of what each seat submitted, and the reveal and the
 * pot are read off it after the hand has moved on.
 */
export type WordWindow =
  | { readonly status: "open"; readonly slots: readonly WordSlot[] }
  | { readonly status: "settled"; readonly slots: readonly WordSlot[] };

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
  /** The seat to act, by index into `seats`; `null` in the word window and once paid out. */
  toActIndex: number | null;
  /** When the current turn's clock runs out, or when §19's window closes, on the caller's timeline. */
  endsAtMs: number;
  /**
   * §19's opt-in for the draft a seat never confirmed: when set, the window closes by
   * confirming that draft for the seat. The rules' preferred default is the player must
   * confirm, so this is off unless the table asks for it.
   */
  autoSubmitDrafts: boolean;
  /** §19's window: `null` until the river closes, then open, then settled. */
  wordWindow: WordWindow | null;
}

/** What `startHand` needs: a seed, the seats, the caller's clock reading, and the table's rules. */
export interface StartHandOptions {
  seed: number;
  players: readonly PlayerId[];
  nowMs: number;
  /**
   * §19's word-building options. Absent means the rules' default: a seat that never confirms
   * has no word, whatever it had typed.
   */
  wordBuilding?: {
    /** Confirm a seat's open draft for it when the window closes. */
    autoSubmitDrafts?: boolean;
  };
}

/**
 * An action that does not fit the state it was handed — dealing mid-hand, passing a turn the
 * table does not have, drafting for a seat that is not in the window. Named so a caller can
 * tell an engine refusal from a programming error, and the message names where the table was.
 */
export class OfflineActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineActionError";
  }
}

/**
 * A word action the engine refused the way §11 refuses a submission: the payload never became
 * the seat's word, and `reason` says why. Separate from {@link OfflineActionError} because
 * this one is the player's to fix — a word too short, a tile they do not hold, a clock they
 * missed — while the other means the action did not fit the table at all.
 */
export class WordRejectionError extends OfflineActionError {
  /** §11's reason, ready to be shown to the seat that sent it. */
  readonly reason: WordRejectionReason;

  constructor(reason: WordRejectionReason) {
    super(`the word was refused: ${reason}`);
    this.name = "WordRejectionError";
    this.reason = reason;
  }
}

/** How many community tiles the phase has face up. */
export function revealedCount(phase: RoundPhase): number {
  return REVEALED_BY_PHASE[phase];
}

/**
 * Deals a fresh hand and puts the first seat on the clock. Everything the round needs is
 * fixed here: the whole board, both private tiles per seat, and the hand's seed. §19's window
 * is not opened here — it belongs to the river, and a hand that never reaches it never builds
 * a word.
 */
export function startHand({ seed, players, nowMs, wordBuilding }: StartHandOptions): OfflineState {
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
    autoSubmitDrafts: wordBuilding?.autoSubmitDrafts ?? false,
    wordWindow: null,
  };
}

/**
 * Applies one action. `nowMs` is the caller's clock reading, used to arm the next turn's
 * deadline, to decide whether §19's window has run out, and for nothing else — nothing here
 * reads a clock of its own.
 */
export function reduce(state: OfflineState, action: OfflineAction, nowMs: number): OfflineState {
  switch (action.type) {
    case "deal": {
      if (state.phase !== "payout") {
        throw new OfflineActionError(
          `deal is only legal once the hand has paid out; the table is at ${where(state)}`,
        );
      }
      return nextHand(state, nowMs);
    }

    case "advance": {
      // A paid-out hand has no turn left to pass, so `advance` rolls the next hand instead.
      if (state.phase === "payout") return nextHand(state, nowMs);
      if (state.wordWindow?.status === "open") {
        throw new OfflineActionError(
          "the word window is open: the seats are confirming words, and there is no turn to pass",
        );
      }
      return advanceTurn(state, nowMs);
    }

    case "draftWord":
    case "confirmWord":
      return applyWord(state, action, nowMs);

    case "timeoutWords":
      return timeoutWords(state, nowMs);
  }
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

  // The river has closed, so §19's window opens where the payout would have: the seats build
  // their words first and the hand pays out when every seat has confirmed or run out of time.
  // The whole board stays face up, and nobody is on the clock but the table.
  if (phase === "payout") {
    return {
      ...state,
      toActIndex: null,
      endsAtMs: nowMs + WORD_WINDOW_MS,
      wordWindow: { status: "open", slots: emptySlots(state) },
    };
  }

  return {
    ...state,
    phase,
    revealed: revealedCount(phase),
    toActIndex: 0,
    endsAtMs: nowMs + OFFLINE_TURN_MS,
  };
}

/** One drafting slot per seat, in seat order, the moment the window opens. */
function emptySlots(state: OfflineState): readonly WordSlot[] {
  return state.seats.map((seat) => ({ playerId: seat.id, status: "drafting", draft: null }));
}

/** Drafts or confirms one seat's word inside §19's window. */
function applyWord(
  state: OfflineState,
  action: Extract<OfflineAction, { type: "draftWord" | "confirmWord" }>,
  nowMs: number,
): OfflineState {
  const window = state.wordWindow;
  if (window === null) {
    throw new OfflineActionError(
      `no word window has opened at ${state.phase}: words are built once the river closes`,
    );
  }
  if (window.status === "settled") {
    throw new OfflineActionError(
      "the word window has closed: a settled hand's words are the record it left behind",
    );
  }
  if (nowMs >= state.endsAtMs) {
    // The clock is the first thing checked, because it is what the seat ran out of: a word
    // that arrives late is refused as late, however good it is (§19).
    throw new WordRejectionError("timer-expired");
  }

  const index = window.slots.findIndex((slot) => slot.playerId === action.playerId);
  const slot = window.slots[index];
  if (slot === undefined) {
    throw new OfflineActionError(`${action.playerId} is not in the word window`);
  }
  if (slot.status === "confirmed") {
    throw new OfflineActionError(
      `${action.playerId} has confirmed a word, and a confirmed word cannot be replaced`,
    );
  }
  if (slot.status === "timed-out") {
    throw new OfflineActionError(`${action.playerId} is out of time; the window does not reopen`);
  }

  const resolution = resolveSubmission({
    available: availableTiles(state, index),
    submission: action.submission,
  });
  if (!resolution.ok) {
    throw new WordRejectionError(resolution.reason);
  }

  const slots = [...window.slots];
  slots[index] =
    action.type === "confirmWord"
      ? { playerId: slot.playerId, status: "confirmed", submission: action.submission }
      : { playerId: slot.playerId, status: "drafting", draft: action.submission };

  const next: OfflineState = { ...state, wordWindow: { status: "open", slots } };

  // Every seat that has a word has confirmed one, so there is nobody left to wait for: the
  // window's deadline is a deadline, not a stay, and the hand moves on (§19).
  return slots.every((candidate) => candidate.status === "confirmed") ? settleWindow(next) : next;
}

/**
 * §19's window closing with the clock run out: every seat that never confirmed is out of
 * time, and the hand moves on to the payout. Only legal at or after the deadline — the seats
 * still have their sixty seconds until then — and the settled window is what the caller gets
 * back, so the reveal has every seat's word without another round trip.
 */
function timeoutWords(state: OfflineState, nowMs: number): OfflineState {
  const window = state.wordWindow;
  if (window === null) {
    throw new OfflineActionError(`no word window has opened at ${state.phase}`);
  }
  if (window.status === "settled") {
    throw new OfflineActionError(
      "the word window has already closed; a second timeout has nothing left to settle",
    );
  }
  if (nowMs < state.endsAtMs) {
    throw new OfflineActionError(
      `the word window still has ${state.endsAtMs - nowMs}ms to run, so the seats may still confirm`,
    );
  }

  return settleWindow(state);
}

/**
 * Closes §19's window: seats that never confirmed are out of time — or, when the table opted
 * into auto-submit, have the draft they left behind confirmed for them — and the hand moves
 * on to the payout. The slots outlive the close because the reveal and the pot read them.
 */
function settleWindow(state: OfflineState): OfflineState {
  const window = state.wordWindow;
  if (window === null || window.status === "settled") return state;

  const slots = window.slots.map((slot, index) => closeSlot(slot, state, index));

  return { ...state, phase: "payout", toActIndex: null, wordWindow: { status: "settled", slots } };
}

/** How one seat's slot ends when the window closes (§19). */
function closeSlot(slot: WordSlot, state: OfflineState, index: number): WordSlot {
  if (slot.status !== "drafting") return slot;

  const draft = slot.draft;
  if (draft !== null && state.autoSubmitDrafts && isBuildable(state, index, draft)) {
    return { playerId: slot.playerId, status: "confirmed", submission: draft };
  }

  return { playerId: slot.playerId, status: "timed-out" };
}

/** Whether a submission can be built from what this seat holds at all (§10–§12, no dictionary). */
function isBuildable(state: OfflineState, seatIndex: number, submission: WordSubmission): boolean {
  return resolveSubmission({ available: availableTiles(state, seatIndex), submission }).ok;
}

/**
 * Every tile a seat may build from: its private tiles plus the whole community board (§12).
 * The seat is looked up by index because the window's slots are index-aligned with `seats`;
 * `?? []` is unreachable for a seat in the window, and is spelled out rather than cast.
 */
function availableTiles(state: OfflineState, seatIndex: number): readonly Tile[] {
  const seat = state.seats[seatIndex];
  return seat === undefined ? [] : [...seat.privateTiles, ...state.community];
}

/** Where the table is, for a refusal to name: the phase, and §19's window when it is open. */
function where(state: OfflineState): string {
  return state.wordWindow?.status === "open" ? `${state.phase} with its word window open` : state.phase;
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
    wordBuilding: { autoSubmitDrafts: state.autoSubmitDrafts },
  });

  return { ...fresh, hand: state.hand + 1 };
}
