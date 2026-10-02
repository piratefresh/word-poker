import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { WORD_CHECKS_PER_HAND, type OfflineAction, type WordSubmission } from "@wordpoker/contracts";

import { BettingRejectionError } from "../src/core/errors";
import { availableTiles, reduce } from "../src/table/offline";
import {
  TUTORIAL_HERO,
  TUTORIAL_RAISE_TO,
  TUTORIAL_SCRIPT,
  TUTORIAL_TARGET_WORD,
  applyTutorialAction,
  nextScriptedAction,
  startTutorial,
  tutorialCheckpoint,
  type TutorialRun,
  type TutorialStep,
} from "../src/table/tutorial";
import { evaluateWord } from "../src/words/building";
import { loadDictionary, type Dictionary } from "../src/words/dictionary";
import { cloneState } from "./fixtures";

const NOW = 1_000_000;
/** The adapter's CPU beat; any value inside the turn clock replays the same hand. */
const BEAT = 900;

let dictionary: Dictionary;
before(async () => {
  dictionary = await loadDictionary();
});

const word = (...ids: string[]): WordSubmission => ({ plays: ids.map((tileId) => ({ tileId })) });
const BROWN = word("B-2", "R-3", "O-5", "W-1", "N-5");
const BROWNE = word("B-2", "R-3", "O-5", "W-1", "N-5", "E-10");
const ROB = word("R-3", "O-5", "B-2");
const NWORB = word("N-5", "W-1", "O-5", "R-3", "B-2");

/** The hero's coached move at a checkpoint, with the word it confirms swappable. */
function heroAction(step: TutorialStep, submission: WordSubmission): OfflineAction {
  assert.ok("move" in step);
  const move = step.move;
  switch (move.type) {
    case "raise":
      return { type: "raise", playerId: TUTORIAL_HERO, amount: move.amount };
    case "confirmWord":
      return { type: "confirmWord", playerId: TUTORIAL_HERO, submission };
    default:
      return { type: move.type, playerId: TUTORIAL_HERO };
  }
}

/** Plays the script's own moves until the checkpoint named `stepId` is the one waiting. */
function playTo(stepId: string, nowMs = NOW): TutorialRun {
  let run = startTutorial({ dictionary, nowMs });
  while (TUTORIAL_SCRIPT[run.step]?.id !== stepId) {
    const checkpoint = tutorialCheckpoint(run, nowMs);
    assert.equal(checkpoint.status, "on-script", JSON.stringify(checkpoint));
    assert.ok(checkpoint.status === "on-script");
    const action = nextScriptedAction(run, nowMs) ?? heroAction(checkpoint.step, BROWN);
    const applied = applyTutorialAction(run, action, nowMs);
    assert.ok(applied.ok, JSON.stringify(applied));
    run = applied.run;
  }
  return run;
}

interface Visit {
  id: string;
  pot: number;
  currentBet: number | null;
}

/**
 * Plays the lesson to its end, one beat per action, and records each checkpoint as it is met.
 * The bots' moves come only from `nextScriptedAction`; each beat applies exactly one.
 */
function replay(heroWord: WordSubmission = BROWN): { run: TutorialRun; visits: Visit[] } {
  let run = startTutorial({ dictionary, nowMs: NOW });
  let now = NOW;
  const visits: Visit[] = [];
  for (;;) {
    now += BEAT;
    const checkpoint = tutorialCheckpoint(run, now);
    if (checkpoint.status === "complete") return { run, visits };
    assert.equal(checkpoint.status, "on-script", JSON.stringify(checkpoint));
    assert.ok(checkpoint.status === "on-script");
    const { step } = checkpoint;
    visits.push({
      id: step.id,
      pot: run.state.seats.reduce((sum, seat) => sum + seat.committedHand, 0),
      currentBet: run.state.betting?.currentBet ?? null,
    });
    const scripted = nextScriptedAction(run, now);
    const action = "move" in step ? heroAction(step, heroWord) : scripted;
    assert.equal(scripted === null, "move" in step, `${step.id}: only bot checkpoints are scripted`);
    assert.ok(action);
    const applied = applyTutorialAction(run, action, now);
    assert.ok(applied.ok, JSON.stringify(applied));
    assert.equal(applied.run.step, run.step + 1, `${step.id} advances exactly one checkpoint`);
    run = applied.run;
  }
}

describe("tutorial scenario (STO-271)", () => {
  it("deals the probed Classic hand on the offline roster, the hero on the button", () => {
    const { state, step } = startTutorial({ dictionary, nowMs: NOW });

    assert.equal(step, 0);
    assert.equal(state.powers, undefined, "Classic opens no Power Draw");
    assert.equal(state.dealerSeat, 0);
    assert.equal(state.seats[state.toActIndex ?? -1]?.id, "mira", "first to act is clockwise from the big blind");
    assert.deepEqual(
      state.seats.map((seat) => [seat.id, seat.stack, seat.committedRound]),
      [["hero", 1000, 0], ["ellis", 990, 10], ["jay", 980, 20], ["mira", 1000, 0]],
    );
    assert.deepEqual(state.seats[0]?.privateTiles.map((tile) => [tile.letter, tile.multiplier ?? null]), [
      ["W", "double-letter"],
      ["B", null],
    ]);
    assert.equal(state.community.map((tile) => tile.letter).join(""), "NROEE");
  });

  it("authors only words the shipped dictionary takes from the seat's own tiles", () => {
    const { state } = startTutorial({ dictionary, nowMs: NOW });
    const judge = (seat: number, submission: WordSubmission) =>
      evaluateWord({ available: availableTiles(state, seat), submission, dictionary });

    const target = judge(0, BROWN);
    assert.ok(target.valid);
    assert.equal(target.word, TUTORIAL_TARGET_WORD);
    // The coached word uses both private tiles, and only the flop besides (N R O are the first three).
    assert.ok(["W-1", "B-2"].every((id) => BROWN.plays.some((play) => play.tileId === id)));
    const flop = new Set(["W-1", "B-2", ...state.community.slice(0, 3).map((tile) => tile.id)]);
    assert.ok(BROWN.plays.every((play) => flop.has(play.tileId)));

    const jay = TUTORIAL_SCRIPT.find((step) => step.id === "window-jay-word");
    assert.ok(jay && "action" in jay && jay.action.type === "confirmWord");
    const goner = judge(2, jay.action.submission);
    assert.ok(goner.valid);
    assert.equal(goner.word, "GONER");
  });

  it("replays blinds, a call, a raise-to, a later check, every street and the window to the real payout", () => {
    const { run, visits } = replay();

    assert.deepEqual(visits, [
      { id: "preflop-mira-fold", pot: 30, currentBet: 20 },
      { id: "preflop-hero-call", pot: 30, currentBet: 20 },
      { id: "preflop-ellis-call", pot: 50, currentBet: 20 },
      { id: "preflop-jay-check", pot: 60, currentBet: 20 },
      { id: "flop-ellis-check", pot: 60, currentBet: 0 },
      { id: "flop-jay-bet", pot: 60, currentBet: 0 },
      { id: "flop-hero-raise", pot: 80, currentBet: 20 },
      { id: "flop-ellis-fold", pot: 140, currentBet: TUTORIAL_RAISE_TO },
      { id: "flop-jay-call", pot: 140, currentBet: TUTORIAL_RAISE_TO },
      { id: "turn-jay-check", pot: 180, currentBet: 0 },
      { id: "turn-hero-check", pot: 180, currentBet: 0 },
      { id: "river-jay-check", pot: 180, currentBet: 0 },
      { id: "river-hero-check", pot: 180, currentBet: 0 },
      { id: "window-hero-word", pot: 180, currentBet: null },
      { id: "window-jay-word", pot: 180, currentBet: null },
    ]);
    assert.deepEqual(
      TUTORIAL_SCRIPT.map((step) => step.revealed),
      [0, 0, 0, 0, 3, 3, 3, 3, 3, 4, 4, 5, 5, 5, 5],
    );

    const { state } = run;
    assert.equal(state.phase, "payout");
    const result = state.result;
    assert.ok(result);
    assert.equal(result.winner, TUTORIAL_HERO);
    assert.deepEqual(
      result.standings.map((row) => [row.playerId, row.word, row.reason, row.score]),
      [["hero", "BROWN", null, 22], ["jay", "GONER", null, 12]],
    );
    assert.deepEqual(state.seats.map((seat) => [seat.id, seat.stack]), [
      ["hero", 1100],
      ["ellis", 980],
      ["jay", 920],
      ["mira", 1000],
    ]);
  });

  it("replays the same hand every time", () => {
    assert.deepEqual(cloneState(replay().run.state), cloneState(replay().run.state));
  });

  it("keeps the actual result of a word the lesson did not coach", () => {
    const longer = replay(BROWNE).run.state.result;
    assert.ok(longer);
    assert.equal(longer.winner, TUTORIAL_HERO);
    assert.equal(longer.standings[0]?.word, "BROWNE");
    assert.equal(longer.standings[0]?.score, 23);

    const short = replay(ROB).run;
    assert.equal(short.state.result?.winner, "jay", "ROB (10) loses to GONER (12)");
    assert.equal(short.state.seats.find((seat) => seat.id === "jay")?.stack, 1100);
  });

  it("locks in a buildable dictionary miss and scores it 0", () => {
    const { state } = replay(NWORB).run;
    const heroRow = state.result?.standings.find((row) => row.playerId === TUTORIAL_HERO);
    assert.equal(heroRow?.word, null);
    assert.equal(heroRow?.reason, "not-in-dictionary");
    assert.equal(state.result?.winner, "jay");
  });

  it("refuses an off-script hero move with a diagnostic and lets the checkpoint be retried", () => {
    const run = playTo("preflop-hero-call");

    const fold = applyTutorialAction(run, { type: "fold", playerId: TUTORIAL_HERO }, NOW);
    assert.ok(!fold.ok);
    assert.deepEqual(fold.divergence, {
      stepId: "preflop-hero-call",
      expected: "hero to call",
      found: "hero fold",
    });

    const outOfTurn = applyTutorialAction(run, { type: "call", playerId: "ellis" }, NOW);
    assert.ok(!outOfTurn.ok);
    assert.equal(outOfTurn.divergence.stepId, "preflop-hero-call");

    const retried = applyTutorialAction(run, { type: "call", playerId: TUTORIAL_HERO }, NOW);
    assert.ok(retried.ok);
    assert.equal(TUTORIAL_SCRIPT[retried.run.step]?.id, "preflop-ellis-call");
  });

  it("refuses the hero acting before the bot whose turn it is", () => {
    const run = startTutorial({ dictionary, nowMs: NOW });
    const early = applyTutorialAction(run, { type: "call", playerId: TUTORIAL_HERO }, NOW);
    assert.ok(!early.ok);
    assert.deepEqual(early.divergence, { stepId: "preflop-mira-fold", expected: "mira to fold", found: "hero call" });
  });

  it("accepts any legal raise-to up to the lesson's cap, and leaves the floor to the engine", () => {
    const run = playTo("flop-hero-raise");

    const huge = applyTutorialAction(run, { type: "raise", playerId: TUTORIAL_HERO, amount: 500 }, NOW);
    assert.ok(!huge.ok);
    assert.match(huge.divergence.expected, /at most 200/);
    assert.throws(
      () => applyTutorialAction(run, { type: "raise", playerId: TUTORIAL_HERO, amount: 30 }, NOW),
      (error) => error instanceof BettingRejectionError && error.reason === "below-min-raise",
    );
    const other = applyTutorialAction(run, { type: "raise", playerId: TUTORIAL_HERO, amount: 100 }, NOW);
    assert.ok(other.ok, "a different legal amount is still the taught interaction");
  });

  it("reports a table that has left the script, naming the checkpoint", () => {
    const run = playTo("preflop-hero-call");

    const expired = tutorialCheckpoint(run, run.state.endsAtMs);
    assert.ok(expired.status === "diverged");
    assert.equal(expired.divergence.stepId, "preflop-hero-call");
    assert.match(expired.divergence.found, /clock ran out/);
    assert.equal(nextScriptedAction(run, run.state.endsAtMs), null);

    // A fold slipped past the script straight into the reducer.
    const forced: TutorialRun = { ...run, state: reduce(run.state, { type: "fold", playerId: TUTORIAL_HERO }, NOW) };
    const checkpoint = tutorialCheckpoint(forced, NOW);
    assert.ok(checkpoint.status === "diverged");
    assert.deepEqual(checkpoint.divergence, {
      stepId: "preflop-hero-call",
      expected: "hero to act",
      found: "ellis to act",
    });
    assert.equal(nextScriptedAction(forced, NOW), null, "the bots never play on past a divergence");
  });

  it("lets the hero check a word without moving the script, and restart resets everything", () => {
    const run = startTutorial({ dictionary, nowMs: NOW });
    const checked = applyTutorialAction(
      run,
      { type: "checkWord", playerId: TUTORIAL_HERO, submission: word("B-2", "R-3", "O-5", "W-1") },
      NOW,
    );
    assert.ok(checked.ok);
    assert.equal(checked.run.step, 0);
    assert.equal(checked.run.state.wordChecks[TUTORIAL_HERO]?.checksRemaining, WORD_CHECKS_PER_HAND - 1);
    assert.equal(checked.run.state.wordChecks[TUTORIAL_HERO]?.result?.valid, true);

    const played = replay().run;
    const restarted = startTutorial({ dictionary, nowMs: NOW });
    assert.equal(restarted.step, 0);
    assert.deepEqual(cloneState(restarted.state), cloneState(run.state));
    assert.notDeepEqual(cloneState(played.state), cloneState(restarted.state));
  });
});
