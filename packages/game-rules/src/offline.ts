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
 * The payout is where the shared engine's other half lands: every confirmed word is judged
 * against the table's dictionary (§11), scored by §7, and the whole table is ranked by §21's
 * ladder — including a seat that never confirmed, which §11 places at 0 points and §21.3's
 * draw can still separate from its equals. Betting is what is still absent: no chips move,
 * and the hand simply names the seat that took the top place.
 */

import {
  ROUND_PHASES,
  type OfflineAction,
  type PlayerId,
  type RoundPhase,
  type ShowdownComparison,
  type ShowdownStanding,
  type Tile,
  type WordRejectionReason,
  type WordSubmission,
} from "@wordpoker/contracts";

import { evaluateWord, resolveSubmission } from "./building";
import { dealHand } from "./deal";
import type { Dictionary } from "./dictionary";
import { createRng } from "./rng";
import { scoreWord } from "./scoring";
import { rankShowdown } from "./showdown";

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
 * The seed the current hand replays from: the table's seed stepped once per hand, so the
 * first hand is dealt from `seed` and every later one from `seed + hand - 1`.
 */
function handSeed(state: OfflineState): number {
  return state.seed + state.hand - 1;
}

/**
 * Salt for §21.3's draw. The draw is its own stream of rolls, derived from the hand's seed
 * rather than continuing the deal's: a hand that reaches the draw has to replay the same way,
 * and a draw must not be able to disturb the tiles a later hand deals.
 */
const DRAW_SEED_SALT = 0x5eed_21;

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

/**
 * One seat's word at the reveal: §21's place, plus what the seat actually submitted and why
 * it scored nothing when it did. The word and the reason are what a reveal shows beside the
 * score; the place and the comparison come straight off the ladder.
 */
export interface OfflineStanding extends ShowdownStanding {
  /** The word the seat's tiles spelled, uppercase; `null` when it confirmed none. */
  readonly word: string | null;
  /**
   * §11's reason this seat scored nothing, or `null` when its word was valid. A seat whose
   * clock ran out never confirmed a word at all, which is `timer-expired` — the rules score
   * both cases 0, so the reveal says which happened.
   */
  readonly reason: WordRejectionReason | null;
}

/** A settled hand: every seat's word and place (§21), and the passes that ordered them. */
export interface HandResult {
  /** Every seat, best first — the ladder places all of them, ties included. */
  readonly standings: readonly OfflineStanding[];
  /** §21's passes, in the order the ladder made them, for the reveal to narrate. */
  readonly comparisons: readonly ShowdownComparison[];
  /** The seat on the top place: who the hand awards its pot to. */
  readonly winner: PlayerId;
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
  /**
   * The word list this hand is judged against, held for the whole hand so the payout and a
   * replayed action sequence cannot disagree about which words count (§11). A table displays
   * it before play, so it is a setting rather than something the payout goes looking for.
   */
  dictionary: Dictionary;
  /**
   * §21's settled reveal, `null` until §19's window closes. It outlives the window because
   * the felt and the pot are read off it after the hand has paid out.
   */
  result: HandResult | null;
}

/** What `startHand` needs: a seed, the seats, the caller's clock reading, and the table's rules. */
export interface StartHandOptions {
  seed: number;
  players: readonly PlayerId[];
  nowMs: number;
  /**
   * The word list the hand is judged against at the payout (§11). Required, because a hand
   * whose words nothing can judge is not a hand: it is the same setting the table displays
   * before play, and it rides on the state so every later action judges against it.
   */
  dictionary: Dictionary;
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
export function startHand({ seed, players, nowMs, dictionary, wordBuilding }: StartHandOptions): OfflineState {
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
    dictionary,
    result: null,
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

  const slots = [...window.slots];

  // §19's draft is a sliding one, and clearing it is part of editing it: an empty submission
  // is how a seat says it has typed nothing. §11 refuses an empty *word*, and that refusal
  // still lands on a confirm below — a seat that confirms nothing never confirms at all.
  if (action.type === "draftWord" && action.submission.plays.length === 0) {
    slots[index] = { playerId: slot.playerId, status: "drafting", draft: null };
  } else {
    const resolution = resolveSubmission({
      available: availableTiles(state, index),
      submission: action.submission,
    });

    // §12's floor is a rule about the word a seat stands behind, not about what it is typing:
    // a draft of one tile is a word in progress, and the floor is applied again at the confirm
    // — the moment the submission becomes the seat's word, and the moment `slots` is built.
    const typing = action.type === "draftWord" && !resolution.ok && resolution.reason === "too-short";
    if (!resolution.ok && !typing) {
      throw new WordRejectionError(resolution.reason);
    }

    slots[index] =
      action.type === "confirmWord"
        ? { playerId: slot.playerId, status: "confirmed", submission: action.submission }
        : { playerId: slot.playerId, status: "drafting", draft: action.submission };
  }

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
 * on to the payout, judged. The slots outlive the close because the reveal and the pot read
 * them.
 */
function settleWindow(state: OfflineState): OfflineState {
  const window = state.wordWindow;
  if (window === null || window.status === "settled") return state;

  const slots = window.slots.map((slot, index) => closeSlot(slot, state, index));

  return {
    ...state,
    phase: "payout",
    toActIndex: null,
    wordWindow: { status: "settled", slots },
    result: judgeWindow(state, slots),
  };
}

/**
 * Judges the settled window: what each seat's word was, what it scored, and where §21's
 * ladder places the whole table.
 *
 * A seat is judged against its own tiles plus the board, exactly the tiles it built from, so
 * a submission cannot be re-judged against tiles the seat never held. The ladder needs
 * randomness only for §21.3's draw — the seats that are still tied with nothing left to
 * compare — and that draw replays from the hand's own seed, so settling a hand twice ranks
 * it the same way.
 */
function judgeWindow(state: OfflineState, slots: readonly WordSlot[]): HandResult {
  const judged = slots.map((slot, seat) => {
    if (slot.status !== "confirmed") {
      // §11: no word is 0 points. The clock, not the dictionary, is what refused this seat.
      return { playerId: slot.playerId, seat, word: null, score: null, reason: "timer-expired" as WordRejectionReason };
    }

    const evaluation = evaluateWord({
      available: availableTiles(state, seat),
      submission: slot.submission,
      dictionary: state.dictionary,
    });
    if (!evaluation.valid) {
      return { playerId: slot.playerId, seat, word: null, score: null, reason: evaluation.reason };
    }

    return { playerId: slot.playerId, seat, word: evaluation.word, score: scoreWord(evaluation.tiles), reason: null };
  });

  const ranking = rankShowdown({
    entries: judged.map(({ playerId, seat, score }) => ({
      playerId,
      seat,
      ...(score === null ? {} : { word: score }),
    })),
    rng: createRng(handSeed(state) + DRAW_SEED_SALT),
  });

  // The ladder's standings carry the seat, and both lists are seat-ordered, so a seat's word
  // and reason come from the same index the ranking read its score from.
  const standings = ranking.standings.map((standing) => {
    const entry = judged[standing.seat];
    return {
      ...standing,
      word: entry?.word ?? null,
      reason: entry?.reason ?? null,
    } satisfies OfflineStanding;
  });

  return {
    standings,
    comparisons: ranking.comparisons,
    winner: standings[0]?.playerId ?? "",
  };
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
 *
 * Exported because a caller that picks words for a seat — the offline bot, the felt's word
 * builder — must choose from exactly the tiles the engine will judge that seat against.
 */
export function availableTiles(state: OfflineState, seatIndex: number): readonly Tile[] {
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
 * The hand after this one. A fresh deal from the hand's own seed stepped forward, so the run
 * stays reproducible without ever reshuffling tiles that were already on the felt — and the
 * same table settings, dictionary included, because a table does not change its rules between
 * hands.
 */
function nextHand(state: OfflineState, nowMs: number): OfflineState {
  const fresh = startHand({
    seed: handSeed(state) + 1,
    players: state.seats.map((seat) => seat.id),
    nowMs,
    dictionary: state.dictionary,
    wordBuilding: { autoSubmitDrafts: state.autoSubmitDrafts },
  });

  return { ...fresh, hand: state.hand + 1 };
}
