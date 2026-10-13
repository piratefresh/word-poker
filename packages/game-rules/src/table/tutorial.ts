/**
 * tutorial.ts — the guided lesson's hand: one authored Classic deal, its script, and the
 * scripted opponents who play it (STO-271).
 *
 * The lesson is an ordinary offline hand, not a second engine. `startTutorial` deals it through
 * `startHand` from a probed seed with the table's ordinary settings (`scripts/probe-tutorial.ts`
 * found it), and every move — the hero's and the bots' — goes through `reduce`. What this file
 * adds is the script: the moves the lesson expects, in order, each a checkpoint that names its
 * actor and the table it expects to find.
 *
 * Seed 999 seats four — the offline table's own roster — with the hero on the button holding H²
 * and L. Pre-flop Mira, first to act, folds, and the hero owes the big blind and calls; the flop
 * (O C T) already spells CLOTH, Jay bets into it and the hero raises; the turn and the river
 * are checked through. In §19's window the hero confirms CLOTH (19) and Jay OCTET (10), so the
 * coached win is the engine's own scoring. A player who builds something else keeps whatever
 * that word actually scores.
 *
 * The bots act one move per call to `nextScriptedAction`, so the adapter that owns the clock
 * can give each its own beat. A hero action off the script is refused with a divergence and
 * leaves the run untouched, which is the retry path; a table that has left the script — a clock
 * that ran out, a raise that put a seat all in — reports the same divergence from
 * `tutorialCheckpoint`, and `startTutorial` is the restart. Nothing here forces an action the
 * engine would refuse or writes a result of its own.
 */

import type { OfflineAction, PlayerId, RoundPhase, WordSubmission } from "@wordpoker/contracts";

import { bettingBounds } from "../money/betting";
import { OfflineActionError } from "../core/errors";
import { evaluateWord } from "../words/building";
import type { Dictionary } from "../words/dictionary";
import { availableTiles, reduce, startHand, type HandResult, type OfflineState } from "./offline";

/** The tutorial's seats, in seat order: the hero holds the dealer button. */
export const TUTORIAL_PLAYERS = ["hero", "ellis", "jay", "mira"] as const;

/** The seat the player takes. */
export const TUTORIAL_HERO: PlayerId = "hero";

/** The probed seed the lesson is dealt from (`scripts/probe-tutorial.ts`). */
export const TUTORIAL_SEED = 999;

/**
 * Which version of the lesson this is. A change to the seed, the seats or the script is a new
 * lesson, and the app's remembered completion (STO-511) is keyed by it.
 */
export const TUTORIAL_VERSION = 2;

/** The hero's coached word: C L O T H, there from the flop. */
export const TUTORIAL_TARGET_WORD = "CLOTH";
const TARGET_SUBMISSION: WordSubmission = {
  plays: [{ tileId: "C-2" }, { tileId: "L-1" }, { tileId: "O-1" }, { tileId: "T-3" }, { tileId: "H-1" }],
};

/** Jay's word: OCTET — a word a new player can read at the reveal. */
const JAY_SUBMISSION: WordSubmission = {
  plays: [{ tileId: "O-1" }, { tileId: "C-2" }, { tileId: "T-3" }, { tileId: "E-9" }, { tileId: "T-1" }],
};

/** The raise-to the lesson coaches on the flop, over Jay's 20. */
export const TUTORIAL_RAISE_TO = 60;
/**
 * The largest raise-to the lesson accepts. Anything up to it leaves Jay chips to check the turn
 * and the river with; more would put the hand all in and skip the streets the lesson teaches on.
 */
export const TUTORIAL_MAX_RAISE_TO = 200;

/** What the hero is coached to do at a checkpoint. */
export type TutorialHeroMove =
  | { readonly type: "call" }
  | { readonly type: "check" }
  /** Any legal raise-to from the floor up to `maxAmount`; `amount` is the one the lesson suggests. */
  | { readonly type: "raise"; readonly amount: number; readonly maxAmount: number }
  /** Any word the engine takes; `target` is the one the lesson coaches. */
  | { readonly type: "confirmWord"; readonly word: string; readonly target: WordSubmission };

interface StepBase {
  /** Stable identity, for coaching copy and diagnostics. */
  readonly id: string;
  readonly phase: RoundPhase;
  /** Community tiles face up at this checkpoint. */
  readonly revealed: number;
  /** Whether the checkpoint is in §19's window rather than a betting turn. */
  readonly window: boolean;
}

/** One checkpoint of the script: the seat expected to act, and what it does. */
export type TutorialStep =
  | (StepBase & { readonly actor: typeof TUTORIAL_HERO; readonly move: TutorialHeroMove })
  | (StepBase & { readonly actor: PlayerId; readonly action: OfflineAction });

function hero(id: string, phase: RoundPhase, revealed: number, move: TutorialHeroMove): TutorialStep {
  return { id, phase, revealed, window: move.type === "confirmWord", actor: TUTORIAL_HERO, move };
}

function bot(id: string, phase: RoundPhase, revealed: number, action: OfflineAction & { playerId: PlayerId }): TutorialStep {
  return { id, phase, revealed, window: action.type === "confirmWord", actor: action.playerId, action };
}

/** The lesson, move by move. The bots' moves are exactly what they play. */
export const TUTORIAL_SCRIPT: readonly TutorialStep[] = [
  bot("preflop-mira-fold", "preflop", 0, { type: "fold", playerId: "mira" }),
  hero("preflop-hero-call", "preflop", 0, { type: "call" }),
  bot("preflop-ellis-call", "preflop", 0, { type: "call", playerId: "ellis" }),
  bot("preflop-jay-check", "preflop", 0, { type: "check", playerId: "jay" }),
  bot("flop-ellis-check", "flop", 3, { type: "check", playerId: "ellis" }),
  bot("flop-jay-bet", "flop", 3, { type: "bet", playerId: "jay", amount: 20 }),
  hero("flop-hero-raise", "flop", 3, {
    type: "raise",
    amount: TUTORIAL_RAISE_TO,
    maxAmount: TUTORIAL_MAX_RAISE_TO,
  }),
  bot("flop-ellis-fold", "flop", 3, { type: "fold", playerId: "ellis" }),
  bot("flop-jay-call", "flop", 3, { type: "call", playerId: "jay" }),
  bot("turn-jay-check", "turn", 4, { type: "check", playerId: "jay" }),
  hero("turn-hero-check", "turn", 4, { type: "check" }),
  bot("river-jay-check", "river", 5, { type: "check", playerId: "jay" }),
  hero("river-hero-check", "river", 5, { type: "check" }),
  hero("window-hero-word", "river", 5, {
    type: "confirmWord",
    word: TUTORIAL_TARGET_WORD,
    target: TARGET_SUBMISSION,
  }),
  bot("window-jay-word", "river", 5, { type: "confirmWord", playerId: "jay", submission: JAY_SUBMISSION }),
];

/** A lesson in progress: the table, and how far through the script it is. */
export interface TutorialRun {
  readonly state: OfflineState;
  /** The next checkpoint, by index into `TUTORIAL_SCRIPT`; its length once the hand has paid out. */
  readonly step: number;
}

/** Why the lesson and the table no longer agree, in words a log or a retry prompt can show. */
export interface TutorialDivergence {
  /** The checkpoint the lesson was at; `null` once it was past the last one. */
  readonly stepId: string | null;
  readonly expected: string;
  readonly found: string;
}

/** Where the lesson stands. */
export type TutorialCheckpoint =
  | { readonly status: "on-script"; readonly step: TutorialStep }
  | { readonly status: "complete"; readonly result: HandResult }
  | { readonly status: "diverged"; readonly divergence: TutorialDivergence };

/** What applying an action did: the next run, or the divergence that refused it. */
export type TutorialApply =
  | { readonly ok: true; readonly run: TutorialRun }
  | { readonly ok: false; readonly divergence: TutorialDivergence };

export interface StartTutorialOptions {
  /** The shipped dictionary; the lesson's words are checked against it before the deal. */
  dictionary: Dictionary;
  nowMs: number;
  turnDurationMs?: number;
}

/**
 * Deals the lesson: the probed seed, the three seats, the ordinary Classic table. Also the
 * restart — a fresh run carries nothing over, so the script, the deal, the drafts, the word
 * checks and the stacks all start again.
 *
 * @throws {OfflineActionError} When the dictionary does not take the lesson's authored words
 *   from the tiles the deal gave their seats — a lesson that would coach a word the engine
 *   scores 0 is not dealt.
 */
export function startTutorial({ dictionary, nowMs, turnDurationMs }: StartTutorialOptions): TutorialRun {
  const state = startHand({
    seed: TUTORIAL_SEED,
    players: TUTORIAL_PLAYERS,
    nowMs,
    dictionary,
    dealerSeat: 0,
    ...(turnDurationMs === undefined ? {} : { turnDurationMs }),
  });

  for (const step of TUTORIAL_SCRIPT) {
    const submission = authoredWord(step);
    if (submission === null) continue;
    const seat = state.seats.findIndex((candidate) => candidate.id === step.actor);
    const evaluation = evaluateWord({ available: availableTiles(state, seat), submission, dictionary });
    if (!evaluation.valid) {
      throw new OfflineActionError(`the lesson's word at ${step.id} is refused: ${evaluation.reason}`);
    }
  }

  return { state, step: 0 };
}

function authoredWord(step: TutorialStep): WordSubmission | null {
  if ("move" in step) return step.move.type === "confirmWord" ? step.move.target : null;
  return step.action.type === "confirmWord" ? step.action.submission : null;
}

/** Where the lesson stands at `nowMs`: the checkpoint it waits on, done, or off the script. */
export function tutorialCheckpoint(run: TutorialRun, nowMs: number): TutorialCheckpoint {
  const { state } = run;
  const step = TUTORIAL_SCRIPT[run.step];

  if (step === undefined) {
    return state.phase === "payout" && state.result !== null
      ? { status: "complete", result: state.result }
      : diverged(null, "the hand paid out", `the table at ${state.phase}`);
  }

  if (state.powers !== undefined) return diverged(step.id, "a Classic table", "a Power Draw");
  if (state.phase !== step.phase || state.revealed !== step.revealed) {
    return diverged(
      step.id,
      `${step.phase} with ${step.revealed} community tiles`,
      `${state.phase} with ${state.revealed}`,
    );
  }
  if (nowMs >= state.endsAtMs) {
    return diverged(step.id, `${step.actor}'s clock running`, `the clock ran out at ${state.endsAtMs}`);
  }

  if (step.window) {
    const slot = state.wordWindow?.status === "open"
      ? state.wordWindow.slots.find((candidate) => candidate.playerId === step.actor)
      : undefined;
    return slot?.status === "drafting"
      ? { status: "on-script", step }
      : diverged(step.id, `${step.actor} building a word in the word window`, describeWindow(state, step.actor));
  }

  const toAct = state.toActIndex;
  const acting = toAct === null ? undefined : state.seats[toAct];
  if (toAct === null || acting === undefined || state.betting === null) {
    return diverged(step.id, `${step.actor} to act`, "no betting turn open");
  }
  if (acting.id !== step.actor) {
    return diverged(step.id, `${step.actor} to act`, `${acting.id} to act`);
  }

  const bounds = bettingBounds(state.seats, state.betting, toAct, state.stakes.bigBlind);
  const type = "move" in step ? step.move.type : step.action.type;
  const legal =
    bounds !== null &&
    (type === "call" ? bounds.canCall
      : type === "check" ? bounds.canCheck
      : type === "bet" ? bounds.canBet
      : type === "raise" ? bounds.canRaise
      : type === "fold");
  return legal
    ? { status: "on-script", step }
    : diverged(step.id, `${step.actor} able to ${type}`, `a table where ${type} is not legal`);
}

/**
 * The scripted opponent's move for this beat, or `null` when the checkpoint is the hero's, the
 * lesson is over, or the table has left the script. One move per call: the adapter schedules
 * each on its own beat.
 */
export function nextScriptedAction(run: TutorialRun, nowMs: number): OfflineAction | null {
  const checkpoint = tutorialCheckpoint(run, nowMs);
  if (checkpoint.status !== "on-script" || "move" in checkpoint.step) return null;
  return checkpoint.step.action;
}

/**
 * Applies one action to the lesson. A word check, and a draft inside §19's window, are the
 * hero's to make at any time and leave the script where it is. Anything else must be the
 * checkpoint's move: the hero's within what the step accepts, a bot's exactly as authored. An
 * action off the script is refused with the divergence and the run is unchanged, so the
 * checkpoint can be retried. The engine still judges everything it is handed — its own
 * refusals (a word it will not take, a raise below the floor) are thrown as they always are.
 */
export function applyTutorialAction(run: TutorialRun, action: OfflineAction, nowMs: number): TutorialApply {
  if (action.type === "checkWord" || action.type === "draftWord") {
    return { ok: true, run: { ...run, state: reduce(run.state, action, nowMs) } };
  }

  const checkpoint = tutorialCheckpoint(run, nowMs);
  if (checkpoint.status === "diverged") return { ok: false, divergence: checkpoint.divergence };
  if (checkpoint.status === "complete") {
    return { ok: false, divergence: { stepId: null, expected: "nothing: the lesson is over", found: action.type } };
  }

  const { step } = checkpoint;
  const found = describeAction(action);
  const actor = "playerId" in action ? action.playerId : null;
  if (actor !== step.actor || !matches(step, action)) {
    return { ok: false, divergence: { stepId: step.id, expected: describeStep(step), found } };
  }

  return { ok: true, run: { state: reduce(run.state, action, nowMs), step: run.step + 1 } };
}

function matches(step: TutorialStep, action: OfflineAction): boolean {
  if (!("move" in step)) return JSON.stringify(action) === JSON.stringify(step.action);
  const move = step.move;
  if (action.type !== move.type) return false;
  // The engine judges the floor; the lesson only caps the top.
  return move.type === "raise" && action.type === "raise" ? action.amount <= move.maxAmount : true;
}

function describeStep(step: TutorialStep): string {
  if (!("move" in step)) {
    const amount = "amount" in step.action ? ` ${step.action.amount}` : "";
    return `${step.actor} to ${step.action.type}${amount}`;
  }
  const move = step.move;
  switch (move.type) {
    case "raise":
      return `${step.actor} to raise to at most ${move.maxAmount} (the lesson suggests ${move.amount})`;
    case "confirmWord":
      return `${step.actor} to confirm a word (the lesson coaches ${move.word})`;
    default:
      return `${step.actor} to ${move.type}`;
  }
}

function describeAction(action: OfflineAction): string {
  const who = "playerId" in action ? `${action.playerId} ` : "";
  const amount = "amount" in action ? ` ${action.amount}` : "";
  return `${who}${action.type}${amount}`;
}

function describeWindow(state: OfflineState, actor: PlayerId): string {
  if (state.wordWindow?.status !== "open") return "no word window open";
  const slot = state.wordWindow.slots.find((candidate) => candidate.playerId === actor);
  return slot === undefined ? `${actor} not in the window` : `${actor}'s word ${slot.status}`;
}

function diverged(stepId: string | null, expected: string, found: string): TutorialCheckpoint {
  return { status: "diverged", divergence: { stepId, expected, found } };
}
