/**
 * offline.ts — the offline round engine: one hand, four betting rounds, and §19's window.
 *
 * A pure state machine (AGENTS.md): the seed and the clock are injected, so the same seed and
 * the same action sequence always produce the same hand. Each street — `preflop → flop → turn
 * → river` — runs a real betting round (`betting.ts`, §15): seats fold, check, bet, call,
 * raise or shove, the street rolls only when the round closes, and the board reveals 0/3/4/5
 * community tiles on the way. The first round opens with the blinds already posted (§5, §14):
 * `startHand` commits them before it deals, so the pre-flop turn starts at the seat clockwise
 * from the big blind and that round's Current Bet is the big blind (§15, §23). When the river's
 * round closes, §19's word window opens instead of the payout; the hand pays out once every seat
 * still in it has confirmed a word or run out of time, and §25's pots are layered, ranked and
 * paid in the same transition.
 *
 * §19's window is its own module (`word-window.ts`): this file opens it, hands it the table on
 * every word action, and settles the hand when it closes. The window's own rules are not here.
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
  type OfflineAction,
  type PayoutResult,
  WORD_CHECKS_PER_HAND,
  type PrivateWordCheckState,
  type PlayerId,
  type RoundPhase,
  type ShowdownComparison,
  type ShowdownStanding,
  type Tile,
  type WordRejectionReason,
  type WordCheckResult,
} from "@wordpoker/contracts";

import {
  DEFAULT_STAKES,
  applyBettingAction,
  nextActor,
  type BettingRoundState,
  type BettingSeatState,
  type Stakes,
} from "./betting";
import { evaluateWord, spellSubmission } from "./building";
import { commitChips } from "./chips";
import { dealHand } from "./deal";
import type { Dictionary } from "./dictionary";
import {
  BettingRejectionError,
  OfflineActionError,
} from "./errors";
import { resolvePayout, type JudgedSeat } from "./pots";
import { createRng } from "./rng";
import { scoreWord } from "./scoring";
import { DRAW_SEED_SALT, rankShowdown } from "./showdown";
import * as wordWindow from "./word-window";
import type { WindowSeat, WindowTable, WordSlot, WordWindow } from "./word-window";

/**
 * How long a seat's betting turn lasts on the injected clock. Online and offline use the same
 * one-minute budget.
 */
export const OFFLINE_TURN_MS = 60_000;

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
   * The seat holding the dealer button: the blinds ride on it (§5), pre-flop order starts at the
   * first dealt-in seat clockwise from the big blind, later streets at the first dealt-in seat
   * clockwise from it, and it steps one dealt-in seat per completed hand.
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
  /** Per-seat private dictionary-check quota and latest result, reset by every fresh deal. */
  wordChecks: Readonly<Record<PlayerId, PrivateWordCheckState>>;
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
   * The table's betting settings. Absent means `DEFAULT_STAKES`: 10 / 20 blinds and a
   * 1,000-chip starting stack — settings, not buried literals (ADR 0002, ADR 0004). Online room
   * stakes are derived from the room buy-in instead.
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

function freshWordChecks(
  seats: readonly OfflineSeat[],
): Readonly<Record<PlayerId, PrivateWordCheckState>> {
  const checks: Record<PlayerId, PrivateWordCheckState> = {};
  for (const seat of seats) {
    checks[seat.id] = { checksRemaining: WORD_CHECKS_PER_HAND, result: null };
  }
  return checks;
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

  // The button rides on the blinds, so it is the first dealt-in seat at or clockwise from the
  // one asked for: a seat that is sitting the session out never holds it (§5, ADR 0002).
  const button = nextDealtInSeat(seats, dealerSeat ?? 0);
  const ready = seats.filter((seat) => !seat.sittingOut).length;
  if (ready < 2) {
    throw new OfflineActionError(
      `a hand needs two seats with chips; ${ready} of ${seats.length} seats can play`,
    );
  }

  const tableStakes: Stakes = {
    smallBlind: stakes?.smallBlind ?? DEFAULT_STAKES.smallBlind,
    bigBlind: stakes?.bigBlind ?? DEFAULT_STAKES.bigBlind,
  };
  const blinds = blindSeats(seats, button, ready);
  const posted = postBlinds(seats, blinds, tableStakes);

  // §23: the posted big blind is the round's opening Current Bet — a caller matches the blind
  // even when the big blind seat could not post all of it (§22's short blind).
  const betting: BettingRoundState = { currentBet: tableStakes.bigBlind, lastRaiseSize: 0 };
  // §15: action opens at the first dealt-in seat clockwise from the big blind, which heads-up
  // is the small blind — the button. The big blind itself is still to act, so it keeps its
  // option and its check is what closes the round.
  const toActIndex = nextActor(posted, betting.currentBet, blinds.bigBlind);

  const state: OfflineState = {
    hand: 1,
    seed,
    phase: "preflop",
    seats: posted,
    community: dealt.community,
    revealed: revealedCount("preflop"),
    toActIndex,
    endsAtMs: nowMs + turnDurationMs,
    turnDurationMs,
    dealerSeat: button,
    betting,
    sessionOver: false,
    stakes: tableStakes,
    autoSubmitDrafts: wordBuilding?.autoSubmitDrafts ?? false,
    wordWindow: null,
    wordChecks: freshWordChecks(seats),
    dictionary,
    result: null,
  };

  // Nobody left to act means the whole table is all in on the posts alone: the streets below
  // have nothing to bet, so the hand rolls straight to §19's window, exactly as it does when
  // the last round closes with everyone all in (§13's all-in run-out).
  return toActIndex === null ? rollStreets(state, nowMs) : state;
}

/**
 * The first seat at or clockwise from `from` that is dealt into the hand. The button and both
 * blinds ride on the deal, so none of them ever lands on a seat that is sitting the hand out
 * (§5).
 */
function nextDealtInSeat(seats: readonly OfflineSeat[], from: number): number {
  for (let offset = 0; offset < seats.length; offset += 1) {
    const index = (from + offset) % seats.length;
    if (seats[index]?.sittingOut === false) return index;
  }

  throw new OfflineActionError("no seat is dealt into the hand");
}

/**
 * The two seats the blinds fall on (§5): the two dealt-in seats clockwise from the button.
 * Heads-up is the exception the rule names — the button posts the small blind and the other seat
 * the big blind, which is the same pair read the other way round.
 */
function blindSeats(
  seats: readonly OfflineSeat[],
  button: number,
  dealtIn: number,
): { smallBlind: number; bigBlind: number } {
  const smallBlind = dealtIn === 2 ? button : nextDealtInSeat(seats, button + 1);

  return { smallBlind, bigBlind: nextDealtInSeat(seats, smallBlind + 1) };
}

/**
 * Posts both blinds before any tile is dealt (§5, §14), through the chips model's own commit so
 * the posts are the seats' Committed This Round and Committed This Hand like any other bet. A
 * seat whose stack is smaller than its blind posts all of it and is all in (§22) — the round's
 * opening Current Bet is still the full big blind (§23).
 */
function postBlinds(
  seats: readonly OfflineSeat[],
  blinds: { smallBlind: number; bigBlind: number },
  stakes: Stakes,
): readonly OfflineSeat[] {
  return seats.map((seat, index) => {
    const blind =
      index === blinds.smallBlind ? stakes.smallBlind : index === blinds.bigBlind ? stakes.bigBlind : 0;
    if (blind === 0) return seat;

    const committed = commitChips(seat, blind);
    return {
      ...seat,
      stack: committed.seat.stack,
      committedRound: committed.seat.committedRound,
      committedHand: committed.seat.committedHand,
      allIn: committed.seat.stack === 0,
    };
  });
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

    case "checkWord":
      return applyWordCheck(state, action);

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

  const applied = applyBettingAction(state.seats, round, state.toActIndex, action, state.stakes.bigBlind);
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

/**
 * Apply the server-owned deadline action to the current betting actor. §15 and ADR 0006: an
 * expired turn folds, always — even a seat that owed nothing and could have checked, and even
 * one that has dropped, which runs its own clock before it folds (§29). Pre-selecting check
 * (§36) is how a player avoids the clock; nothing here auto-checks on the seat's behalf.
 */
function timeoutTurn(state: OfflineState, nowMs: number): OfflineState {
  if (state.betting === null || state.toActIndex === null) {
    throw new OfflineActionError(`no betting turn is open at ${where(state)}`);
  }
  if (nowMs < state.endsAtMs) {
    throw new OfflineActionError(
      `the betting turn still has ${state.endsAtMs - nowMs}ms to run`,
    );
  }

  // The clock is this action's whole difference from `foldTurn`: the outcome is the same fold.
  return foldTurn(state, nowMs);
}

/** §28/§29's server-owned fold of the acting seat: it is gone for good — a clean leave, or a
 * reconnect hold that ran out — rather than merely idle. The seat is not there to act, so the
 * turn's deadline cannot make the fold illegal — unlike a voluntary fold, this is legal at any
 * point of the clock, including after it has run out. */
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
  const { window, endsAtMs } = wordWindow.openWindow(inHandSeats(state), nowMs);

  return { ...state, toActIndex: null, betting: null, endsAtMs, wordWindow: window };
}

/**
 * The seats §19's window holds a slot for, in seat order: every seat still in the hand. A
 * folded seat has no word to build and a sitting-out seat is not in the hand at all; an all-in
 * seat does build one — all its chips are in the pot, but §19 is still its.
 */
function inHandSeats(state: OfflineState): readonly WindowSeat[] {
  const seats: WindowSeat[] = [];

  state.seats.forEach((seat, index) => {
    if (seat.folded || seat.sittingOut) return;
    seats.push({ seat: index, playerId: seat.id });
  });

  return seats;
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

/**
 * §19's window as the hand holds it, or a refusal naming where the table is. These two are the
 * hand's refusals rather than the window's: there is no window yet, or the settled one is the
 * record the hand has already moved past. The window's own refusals — a late word, a seat it
 * does not hold — belong to the module, which is handed a window that is open.
 */
function openWindowOf(state: OfflineState): Extract<WordWindow, { status: "open" }> {
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

  return window;
}

/**
 * §19's window as the module reads it: the slots it holds, the clock the whole table shares, the
 * table's auto-submit setting, and the tiles each seat will be judged against — the seat's own
 * plus the board, which is what `availableTiles` answers for the bot and the felt too.
 */
function table(state: OfflineState, slots: readonly WordSlot[]): WindowTable {
  return {
    slots,
    endsAtMs: state.endsAtMs,
    autoSubmitDrafts: state.autoSubmitDrafts,
    tilesFor: (seat) => availableTiles(state, seat),
  };
}

/** Drafts or confirms one seat's word inside §19's window, and settles the hand if that closed it. */
function applyWord(
  state: OfflineState,
  action: Extract<OfflineAction, { type: "draftWord" | "confirmWord" }>,
  nowMs: number,
): OfflineState {
  const open = openWindowOf(state);
  const window = wordWindow.applyWord(table(state, open.slots), action, nowMs);

  return window.status === "settled" ? settleWindow(state, window) : { ...state, wordWindow: window };
}

/** Runs one explicit dictionary lookup, privately, without changing the seat's turn. */
function applyWordCheck(
  state: OfflineState,
  action: Extract<OfflineAction, { type: "checkWord" }>,
): OfflineState {
  if (state.phase === "payout") return state;

  const seatIndex = state.seats.findIndex((seat) => seat.id === action.playerId);
  const seat = seatIndex < 0 ? undefined : state.seats[seatIndex];
  if (seat === undefined || seat.folded || seat.sittingOut) return state;

  const slot = state.wordWindow?.slots.find((candidate) => candidate.playerId === action.playerId);
  if (slot?.status === "confirmed" || slot?.status === "timed-out") return state;

  // Each physical tile contributes one letter. The client disables out-of-range drafts, and
  // this guard makes sure a forged message cannot spend a check either.
  if (action.submission.plays.length < 2 || action.submission.plays.length > 7) return state;

  const current = state.wordChecks[action.playerId] ?? {
    checksRemaining: WORD_CHECKS_PER_HAND,
    result: null,
  };
  if (current.checksRemaining <= 0) return state;

  const available = availableTiles(state, seatIndex);
  const submission = { plays: action.submission.plays.map((play) => ({ ...play })) };
  const evaluation = evaluateWord({ available, submission, dictionary: state.dictionary });
  const result: WordCheckResult = {
    submission,
    word: evaluation.valid ? evaluation.word : spellSubmission({ available, submission }),
    valid: evaluation.valid,
    points: evaluation.valid ? scoreWord(evaluation.tiles).total : null,
  };

  return {
    ...state,
    wordChecks: {
      ...state.wordChecks,
      [action.playerId]: {
        checksRemaining: current.checksRemaining - 1,
        result,
      },
    },
  };
}

/**
 * §19's window closing with the clock run out: every seat that never confirmed is out of
 * time, and the hand moves on to the payout. Only legal at or after the deadline — the seats
 * still have their sixty seconds until then — and the settled window is what the caller gets
 * back, so the reveal has every seat's word without another round trip.
 */
function timeoutWords(state: OfflineState, nowMs: number): OfflineState {
  const open = openWindowOf(state);

  return settleWindow(state, wordWindow.timeout(table(state, open.slots), nowMs));
}

/**
 * Settles §19's window on the hand: the closed window the module handed back is the record the
 * reveal reads, and §21's whole-table ladder and §25's pots run in the same transition that
 * closed it. Seats that never confirmed are already out of time — or, when the table opted into
 * auto-submit, already hold the draft they left behind. The slots outlive the close because the
 * reveal reads them.
 */
function settleWindow(state: OfflineState, window: Extract<WordWindow, { status: "settled" }>): OfflineState {
  const { result, seats } = judgeWindow(state, window.slots);

  return {
    ...state,
    phase: "payout",
    seats,
    toActIndex: null,
    betting: null,
    wordWindow: window,
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
 * clockwise — `startHand` moves it on again from a seat that is no longer dealt in, so it lands
 * on the next seat that plays, the blinds riding on it (§5). When fewer than two seats can still
 * pay a hand, no hand is dealt: the state is returned with `sessionOver` set, which is the
 * session's end-state (ADR 0002).
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
    stakes: { smallBlind: state.stakes.smallBlind, bigBlind: state.stakes.bigBlind },
    turnDurationMs: state.turnDurationMs,
  });

  return { ...fresh, hand: state.hand + 1 };
}
