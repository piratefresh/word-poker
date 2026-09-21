/**
 * offline.ts — the offline round engine: one hand, four betting rounds, and §19's window.
 *
 * A pure state machine (AGENTS.md): the seed and the clock are injected, so the same seed and
 * the same action sequence always produce the same hand. Each street — `preflop → flop → turn
 * → river` — runs a real betting round (`betting.ts`, §15): seats fold, check, bet, call,
 * raise or shove, the street rolls only when the round closes, and the board reveals 0/3/4/5
 * community tiles on the way. When the river's round closes, §19's word window opens instead
 * of the payout; the hand pays out once every seat still in it has confirmed a word or run out
 * of time, and §25's pots are layered, ranked and paid in the same transition.
 *
 * Two ends of the hand are short-circuits rather than rounds. A fold-out — one seat left
 * un-folded — goes straight to the pot with no reveal and no window (§26). An all-in run-out
 * has no seat left to act on the streets still to come, so one action rolls through them all
 * to the window: the intermediate streets are real, but nothing can happen on them, and the
 * step-by-step reveals they would show belong to the animation work (STO-281).
 *
 * Past the payout, the next `deal` rolls into a fresh hand whose seed is derived from the one
 * before, carrying every seat's Table Stack and stepping the dealer button one seat clockwise.
 * A seat whose stack reached zero sits the rest of the session out (ADR 0002), and once fewer
 * than two seats can play — or, from the app's side, the hero has busted — the session ends.
 *
 * The payout is where the shared engine's other half lands: every confirmed word is judged
 * against the table's dictionary (§11), scored by §7, and the whole table is ranked by §21's
 * ladder for the reveal — including a seat that never confirmed, which §11 places at 0 points
 * and §21.3's draw can still separate from its equals. The pots are settled by the same
 * ladder over each pot's own eligible seats (`pots.ts`, §25).
 */

import {
  ROUND_PHASES,
  type BettingAction,
  type BettingRejectionReason,
  type OfflineAction,
  type PayoutResult,
  type PlayerId,
  type RoundPhase,
  type ShowdownComparison,
  type ShowdownStanding,
  type Tile,
  type WordRejectionReason,
  type WordSubmission,
} from "@wordpoker/contracts";

import {
  DEFAULT_STAKES,
  applyBettingAction,
  nextActor,
  type BettingRoundState,
  type BettingSeatState,
  type Stakes,
} from "./betting";
import { evaluateWord, resolveSubmission } from "./building";
import { dealHand } from "./deal";
import type { Dictionary } from "./dictionary";
import { resolvePayout, type JudgedSeat } from "./pots";
import { createRng } from "./rng";
import { scoreWord } from "./scoring";
import { DRAW_SEED_SALT, rankShowdown } from "./showdown";

/**
 * How long a seat's betting turn lasts on the injected clock. Online and offline use the same
 * one-minute budget.
 */
export const OFFLINE_TURN_MS = 60_000;

/**
 * How long §19's word window stays open. One clock for the whole table: the rules give the
 * seats sixty seconds between them, not sixty each.
 */
export const WORD_WINDOW_MS = 60_000;

/**
 * The seed the current hand replays from: the table's seed stepped once per hand, so the
 * first hand is dealt from `seed` and every later one from `seed + hand - 1`.
 *
 * Exported because every derived stream — the bots' rolls included — names a hand by this
 * seed rather than by the state it is played from.
 */
export function handSeed(state: OfflineState): number {
  return state.seed + state.hand - 1;
}

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

/** A seated player: its chips and standing in the hand (E2), plus the tiles the deal gave it. */
export interface OfflineSeat extends BettingSeatState {
  readonly privateTiles: readonly Tile[];
}

/**
 * One seat's slot in §19's window: the word it is working on, the word it committed to, or
 * the fact that its time ran out with no confirmed word — which §11 scores as 0 points.
 *
 * A slot only ever belongs to a seat that is still in the hand: a folded seat builds no word,
 * and neither does a seat sitting the hand out. `seat` is the seat's index in `seats`, which
 * is what lets the window judge a slot against the tiles of the seat it belongs to.
 */
export type WordSlot =
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** What the seat has typed so far; `null` until it drafts anything. Editable. */
      readonly status: "drafting";
      readonly draft: WordSubmission | null;
    }
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** The word the seat confirmed. A confirmed word is locked and never replaced. */
      readonly status: "confirmed";
      readonly submission: WordSubmission;
    }
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** The window closed with nothing confirmed: this seat has no word (§11). */
      readonly status: "timed-out";
    };

/**
 * §19's word window (§19, `docs/rules/hand-flow.md`).
 *
 * `slots` holds one slot per seat still in the hand, in seat order. The settled window stays
 * in the state: it is the record of what each seat submitted, and the reveal and the pot are
 * read off it after the hand has moved on.
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

/** A settled hand: the reveal (§21) and the settlement (§25). */
export interface HandResult {
  /** Every seat still in the hand, best first — the ladder places all of them, ties included. */
  readonly standings: readonly OfflineStanding[];
  /** §21's passes, in the order the ladder made them, for the reveal to narrate. */
  readonly comparisons: readonly ShowdownComparison[];
  /**
   * The seat on the top place. A fold-out has no reveal, so this is the one seat left in the
   * hand (§26) — the seat the hand is awarded to either way.
   */
  readonly winner: PlayerId;
  /** §25's settlement: what every pot paid, and what the hand did to every Table Stack. */
  readonly payout: PayoutResult;
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
  /** The seat to act, by index into `seats`; `null` while no betting round is open. */
  toActIndex: number | null;
  /** When the current turn's clock runs out, or when §19's window closes, on the caller's timeline. */
  endsAtMs: number;
  turnDurationMs: number;
  /**
   * The seat holding the dealer button: turn order starts at the first live seat clockwise
   * from it, and it steps one seat per completed hand. No blinds ride on it (ADR 0001).
   */
  dealerSeat: number;
  /**
   * The open betting round's numbers, or `null` while §19's window is open and once the hand
   * has paid out — the two states where no seat may bet.
   */
  betting: BettingRoundState | null;
  /**
   * Whether the session has ended: fewer than two seats can still pay a hand. The state stays
   * where it ended — phase `payout`, the last result intact — so the felt can show the final
   * stacks, and only a fresh `startHand` (the app's New game) leaves it.
   */
  sessionOver: boolean;
  /** The table's betting settings for the whole session. */
  stakes: Stakes;
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
  /**
   * The table's betting settings. Absent means `DEFAULT_STAKES`: a 20-chip minimum bet and a
   * 1,000-chip starting stack — settings, not buried literals. Online room stakes are derived
   * from the room buy-in instead (ADR 0001, ADR 0002).
   */
  stakes?: Partial<Stakes & { startingStack: number }>;
  /**
   * The Table Stack each seat brings to this hand. A seat missing from the list starts on the
   * table's starting stack, which is what hand 1 does; later hands carry every seat's.
   */
  stacks?: readonly { playerId: PlayerId; stack: number }[];
  /** The seat holding the dealer button. Absent means seat 0, the first hand's button. */
  dealerSeat?: number;
  turnDurationMs?: number;
}

/**
 * An action that does not fit the state it was handed — dealing mid-hand, betting outside a
 * round, drafting for a seat that is not in the window. Named so a caller can tell an engine
 * refusal from a programming error, and the message names where the table was.
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

/**
 * A betting action the engine refused the way §15 refuses one: the chips never moved, and
 * `reason` says why. The betting twin of {@link WordRejectionError}, and for the same reason:
 * "it is not your turn" is the table's answer, not a programming error — the seat can only
 * fix it by acting when its turn comes again.
 */
export class BettingRejectionError extends OfflineActionError {
  /** §15/§22/§23's reason, ready to be shown to the seat that sent it. */
  readonly reason: BettingRejectionReason;

  constructor(reason: BettingRejectionReason) {
    super(`the betting action was refused: ${reason}`);
    this.name = "BettingRejectionError";
    this.reason = reason;
  }
}

/** How many community tiles the phase has face up. */
export function revealedCount(phase: RoundPhase): number {
  return REVEALED_BY_PHASE[phase];
}

/**
 * Deals a fresh hand and puts the first seat clockwise from the dealer button on the clock.
 * Everything the round needs is fixed here: the whole board, both private tiles per seat, the
 * hand's seed, and the stack each seat brings. §19's window is not opened here — it belongs
 * to the river, and a hand that never reaches it never builds a word.
 *
 * @throws {OfflineActionError} When fewer than two seats would hold a Table Stack — a table
 * that cannot play a hand is a session that has ended, not a hand to deal (ADR 0002).
 */
export function startHand({
  seed,
  players,
  nowMs,
  dictionary,
  wordBuilding,
  stakes,
  stacks,
  dealerSeat,
  turnDurationMs: requestedTurnDurationMs,
}: StartHandOptions): OfflineState {
  const turnDurationMs = requestedTurnDurationMs ?? OFFLINE_TURN_MS;
  if (!Number.isFinite(turnDurationMs) || turnDurationMs <= 0) {
    throw new OfflineActionError("the betting turn duration must be positive");
  }
  const dealt = dealHand({ seed, playerCount: players.length });
  const startingStack = stakes?.startingStack ?? DEFAULT_STAKES.startingStack;
  const carried = new Map((stacks ?? []).map((entry) => [entry.playerId, entry.stack]));

  const seats: OfflineSeat[] = players.map((id, seat) => {
    const stack = carried.get(id) ?? startingStack;
    return {
      id,
      stack,
      committedRound: 0,
      committedHand: 0,
      folded: false,
      allIn: false,
      // A seat with no chips left sits the session out (ADR 0002); it is dealt in only in
      // the sense that the table has a place for it.
      sittingOut: stack <= 0,
      actedThisRound: false,
      // `?? []` is unreachable — the deal gives every seat a hand — but the seat index is
      // optional under `noUncheckedIndexedAccess`, so it is spelled out rather than cast.
      privateTiles: dealt.privateTiles[seat] ?? [],
    };
  });

  const button = dealerSeat ?? 0;
  const ready = seats.filter((seat) => !seat.sittingOut).length;
  if (ready < 2) {
    throw new OfflineActionError(
      `a hand needs two seats with chips; ${ready} of ${seats.length} seats can play`,
    );
  }

  // Two seats able to play guarantee the walk from the button finds one of them.
  const toActIndex = nextActor(seats, 0, button);
  if (toActIndex === null) {
    throw new OfflineActionError(`no seat can act at a ${seats.length}-seat table`);
  }

  return {
    hand: 1,
    seed,
    phase: "preflop",
    seats,
    community: dealt.community,
    revealed: revealedCount("preflop"),
    toActIndex,
    endsAtMs: nowMs + turnDurationMs,
    turnDurationMs,
    dealerSeat: button,
    betting: { currentBet: 0, lastRaiseSize: 0 },
    sessionOver: false,
    stakes: { minBet: stakes?.minBet ?? DEFAULT_STAKES.minBet },
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

    case "draftWord":
    case "confirmWord":
      return applyWord(state, action, nowMs);

    case "timeoutWords":
      return timeoutWords(state, nowMs);

    case "timeoutTurn":
      return timeoutTurn(state, nowMs);

    case "foldTurn":
      return foldTurn(state, nowMs);

    case "fold":
    case "check":
    case "bet":
    case "call":
    case "raise":
    case "allIn":
      return applyBetting(state, action, nowMs);
  }
}

/** Applies one betting action to the open round, or refuses it with a named reason. */
function applyBetting(
  state: OfflineState,
  action: BettingAction,
  nowMs: number,
  allowExpired = false,
): OfflineState {
  const round = state.betting;
  if (round === null || state.toActIndex === null) {
    // No round is open: the seats are building words, or the hand has paid out (§19, §26).
    throw new BettingRejectionError("hand-over");
  }
  if (!allowExpired && nowMs >= state.endsAtMs) {
    throw new BettingRejectionError("turn-timeout");
  }

  const applied = applyBettingAction(state.seats, round, state.toActIndex, action, state.stakes.minBet);
  if (!applied.ok) {
    throw new BettingRejectionError(applied.reason);
  }

  const step = applied.step;
  if (step.status === "open") {
    return {
      ...state,
      seats: step.seats,
      betting: step.round,
      toActIndex: step.toAct,
      endsAtMs: nowMs + state.turnDurationMs,
    };
  }

  if (step.status === "hand-over") {
    return foldOut({ ...state, seats: step.seats }, nowMs);
  }

  return rollStreets({ ...state, seats: step.seats, betting: step.round }, nowMs);
}

/** Apply the server-owned deadline action to the current betting actor. */
function timeoutTurn(state: OfflineState, nowMs: number): OfflineState {
  if (state.betting === null || state.toActIndex === null) {
    throw new OfflineActionError(`no betting turn is open at ${where(state)}`);
  }
  if (nowMs < state.endsAtMs) {
    throw new OfflineActionError(
      `the betting turn still has ${state.endsAtMs - nowMs}ms to run`,
    );
  }

  const actor = state.seats[state.toActIndex];
  if (actor === undefined) {
    throw new OfflineActionError("the betting turn names no seat");
  }

  const action: BettingAction =
    actor.committedRound === state.betting.currentBet
      ? { type: "check", playerId: actor.id }
      : { type: "fold", playerId: actor.id };
  return applyBetting(state, action, nowMs, true);
}

/** §29's server-owned fold of the acting seat. The seat is not there to act, so the turn's
 * deadline cannot make the fold illegal — unlike a voluntary fold, this is legal at any point
 * of the clock, including after it has run out. */
function foldTurn(state: OfflineState, nowMs: number): OfflineState {
  if (state.betting === null || state.toActIndex === null) {
    throw new OfflineActionError(`no betting turn is open at ${where(state)}`);
  }
  const actor = state.seats[state.toActIndex];
  if (actor === undefined) {
    throw new OfflineActionError("the betting turn names no seat");
  }
  return applyBetting(state, { type: "fold", playerId: actor.id }, nowMs, true);
}

/** Opens the next street's betting round: the commits and acted flags start over. */
function resetRound(state: OfflineState): OfflineState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...seat, committedRound: 0, actedThisRound: false })),
    betting: { currentBet: 0, lastRaiseSize: 0 },
    toActIndex: null,
  };
}

/**
 * Rolls the street after a completed round (§15). The board reveals as the streets pass, and
 * the walk stops at the first street with a seat left to act — which is the only street whose
 * betting round is observable. When no street has an actor left (every seat is all in, or the
 * river itself just closed), §19's window opens instead.
 */
function rollStreets(state: OfflineState, nowMs: number): OfflineState {
  let next = resetRound(state);

  while (next.phase !== "river") {
    const phase = nextPhase(next.phase);
    next = {
      ...next,
      phase,
      revealed: revealedCount(phase),
      toActIndex: nextActor(next.seats, 0, next.dealerSeat),
    };

    if (next.toActIndex !== null) {
      return { ...next, endsAtMs: nowMs + next.turnDurationMs };
    }
  }

  return openWordWindow(next, nowMs);
}

/** §19's window opening on the whole table: one clock, one slot per seat still in the hand. */
function openWordWindow(state: OfflineState, nowMs: number): OfflineState {
  return {
    ...state,
    toActIndex: null,
    betting: null,
    endsAtMs: nowMs + WORD_WINDOW_MS,
    wordWindow: { status: "open", slots: emptySlots(state) },
  };
}

/**
 * §26's fold-out: one seat is left un-folded, so it takes every pot at once — no reveal, no
 * word, no draw. The settlement runs in the same transition that folded the last opponent.
 */
function foldOut(state: OfflineState, nowMs: number): OfflineState {
  const { payout, seats } = resolvePayout({
    seats: state.seats,
    judged: [],
    dealerSeat: state.dealerSeat,
    handSeed: handSeed(state),
  });

  const winner = seats.find((seat) => !seat.folded && !seat.sittingOut)?.id ?? "";

  return {
    ...state,
    seats,
    phase: "payout",
    betting: null,
    toActIndex: null,
    wordWindow: null,
    endsAtMs: nowMs,
    result: { standings: [], comparisons: [], winner, payout },
  };
}

/** One drafting slot per seat still in the hand, in seat order, the moment the window opens. */
function emptySlots(state: OfflineState): readonly WordSlot[] {
  const slots: WordSlot[] = [];

  state.seats.forEach((seat, index) => {
    // A folded seat has no word to build and a sitting-out seat is not in the hand at all;
    // an all-in seat does build one — all its chips are in the pot, but §19 is still its.
    if (seat.folded || seat.sittingOut) return;
    slots.push({ seat: index, playerId: seat.id, status: "drafting", draft: null });
  });

  return slots;
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
    slots[index] = { seat: slot.seat, playerId: slot.playerId, status: "drafting", draft: null };
  } else {
    const resolution = resolveSubmission({
      available: availableTiles(state, slot.seat),
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
        ? { seat: slot.seat, playerId: slot.playerId, status: "confirmed", submission: action.submission }
        : { seat: slot.seat, playerId: slot.playerId, status: "drafting", draft: action.submission };
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
 * on to the payout, judged and settled. The slots outlive the close because the reveal reads
 * them.
 */
function settleWindow(state: OfflineState): OfflineState {
  const window = state.wordWindow;
  if (window === null || window.status === "settled") return state;

  const slots = window.slots.map((slot) => closeSlot(slot, state));
  const { result, seats } = judgeWindow(state, slots);

  return {
    ...state,
    phase: "payout",
    seats,
    toActIndex: null,
    betting: null,
    wordWindow: { status: "settled", slots },
    result,
  };
}

/** What a settled window leaves behind: the reveal, and the seats with the pots already paid. */
interface WindowSettlement {
  result: HandResult;
  seats: readonly OfflineSeat[];
}

/**
 * Judges the settled window: what each seat's word was, what it scored, where §21's ladder
 * places the whole table, and what §25's pots pay.
 *
 * A seat is judged against its own tiles plus the board, exactly the tiles it built from, so
 * a submission cannot be re-judged against tiles the seat never held. The whole-table ladder
 * needs randomness only for §21.3's draw — the seats that are still tied with nothing left to
 * compare — and that draw replays from the hand's own seed, so settling a hand twice ranks it
 * the same way. The pots then rank their own eligible seats from the same scores, each pot
 * with its own draw stream (`pots.ts`), which is why the same word can win one pot and lose
 * another.
 */
function judgeWindow(state: OfflineState, slots: readonly WordSlot[]): WindowSettlement {
  const judged = slots.map((slot) => {
    if (slot.status !== "confirmed") {
      // §11: no word is 0 points. The clock, not the dictionary, is what refused this seat.
      return {
        playerId: slot.playerId,
        seat: slot.seat,
        word: null,
        score: null,
        reason: "timer-expired" as WordRejectionReason,
      };
    }

    const evaluation = evaluateWord({
      available: availableTiles(state, slot.seat),
      submission: slot.submission,
      dictionary: state.dictionary,
    });
    if (!evaluation.valid) {
      return { playerId: slot.playerId, seat: slot.seat, word: null, score: null, reason: evaluation.reason };
    }

    return {
      playerId: slot.playerId,
      seat: slot.seat,
      word: evaluation.word,
      score: scoreWord(evaluation.tiles),
      reason: null,
    };
  });

  const ranking = rankShowdown({
    entries: judged.map(({ playerId, seat, score }) => ({
      playerId,
      seat,
      ...(score === null ? {} : { word: score }),
    })),
    rng: createRng(handSeed(state) + DRAW_SEED_SALT),
  });

  // The ladder's standings carry the seat, which is what a seat's word and reason are looked
  // up by — the judged list is seat order but only seats still in the hand have entries.
  const standings = ranking.standings.map((standing) => {
    const entry = judged.find((candidate) => candidate.seat === standing.seat);
    return {
      ...standing,
      word: entry?.word ?? null,
      reason: entry?.reason ?? null,
    } satisfies OfflineStanding;
  });

  const { payout, seats } = resolvePayout({
    seats: state.seats,
    judged: judged.map(
      ({ playerId, seat, score }): JudgedSeat => ({ playerId, seat, word: score }),
    ),
    dealerSeat: state.dealerSeat,
    handSeed: handSeed(state),
  });

  return {
    result: {
      standings,
      comparisons: ranking.comparisons,
      winner: standings[0]?.playerId ?? "",
      payout,
    },
    seats,
  };
}

/** How one seat's slot ends when the window closes (§19). */
function closeSlot(slot: WordSlot, state: OfflineState): WordSlot {
  if (slot.status !== "drafting") return slot;

  const draft = slot.draft;
  if (draft !== null && state.autoSubmitDrafts && isBuildable(state, slot.seat, draft)) {
    return { seat: slot.seat, playerId: slot.playerId, status: "confirmed", submission: draft };
  }

  return { seat: slot.seat, playerId: slot.playerId, status: "timed-out" };
}

/** Whether a submission can be built from what this seat holds at all (§10–§12, no dictionary). */
function isBuildable(state: OfflineState, seatIndex: number, submission: WordSubmission): boolean {
  return resolveSubmission({ available: availableTiles(state, seatIndex), submission }).ok;
}

/**
 * Every tile a seat may build from: its private tiles plus the whole community board (§12).
 * The seat is looked up by index because a slot names the seat it belongs to; `?? []` is
 * unreachable for a seat in the window, and is spelled out rather than cast.
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

/** The street after this one. `payout` is the last, and `rollStreets` never asks past it. */
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
 *
 * Every seat carries its Table Stack into the new hand and the dealer button steps one seat
 * clockwise. When fewer than two seats can still pay a hand, no hand is dealt: the state is
 * returned with `sessionOver` set, which is the session's end-state (ADR 0002).
 */
function nextHand(state: OfflineState, nowMs: number): OfflineState {
  if (state.sessionOver) {
    throw new OfflineActionError("the session is over: no seat can be dealt another hand");
  }

  const stacks = state.seats.map((seat) => ({ playerId: seat.id, stack: seat.stack }));
  if (stacks.filter(({ stack }) => stack > 0).length < 2) {
    return { ...state, sessionOver: true };
  }

  const fresh = startHand({
    seed: handSeed(state) + 1,
    players: state.seats.map((seat) => seat.id),
    stacks,
    dealerSeat: (state.dealerSeat + 1) % state.seats.length,
    nowMs,
    dictionary: state.dictionary,
    wordBuilding: { autoSubmitDrafts: state.autoSubmitDrafts },
    stakes: { minBet: state.stakes.minBet },
    turnDurationMs: state.turnDurationMs,
  });

  return { ...fresh, hand: state.hand + 1 };
}
