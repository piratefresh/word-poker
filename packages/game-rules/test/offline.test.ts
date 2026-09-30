import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POWER_DRAW_MS,
  ROUND_PHASES,
  type BettingAction,
  type OfflineAction,
  type PowerRejectionReason,
  type PowerUpId,
  type Tile,
  type TilePlay,
} from "@wordpoker/contracts";

import { bettingBounds } from "../src/betting";
import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "../src/deal";
import { BettingRejectionError, OfflineActionError, PowerRejectionError } from "../src/errors";
import { drawOffers, type PowerDraw } from "../src/power-draw";
import { swapTile } from "../src/power-swap";
import {
  OFFLINE_TURN_MS,
  reduce,
  revealedCount,
  startHand,
  type OfflineState,
  type StartHandOptions,
} from "../src/offline";
import { WORD_WINDOW_MS } from "../src/word-window";
import { TEST_DICTIONARY, cloneState, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

/** The offline table's blinds (§5, ADR 0004): 10 / 20 on the 1,000-chip stacks. */
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
/**
 * Hand 1's positions at the default four-seat table: the button is seat 0, so the small blind is
 * ellis and the big blind jay — and pre-flop opens clockwise from jay, at mira.
 */
const SMALL_BLIND_SEAT = 1;
const BIG_BLIND_SEAT = 2;
const FIRST_TO_ACT = 3;

function dealHand(options: Partial<StartHandOptions> = {}, nowMs = NOW): OfflineState {
  return startHand({ seed: SEED, players: SEATS, nowMs, dictionary: TEST_DICTIONARY, ...options });
}

/** The seat to act, named so a refusal can quote it and a test can use it. */
function actingSeat(state: OfflineState): { index: number; id: string } {
  const index = state.toActIndex;
  assert.ok(index !== null, "a seat is to act");
  const seat = state.seats[index];
  assert.ok(seat, `seat ${index}`);
  return { index, id: seat.id };
}

/**
 * The polite move for the seat to act: call what it owes, check when it owes nothing. No seat
 * ever raises, so a hand walked this way is one blind-sized bet in the pot and every street
 * checked around after it.
 */
function politeAction(state: OfflineState): BettingAction {
  const { index, id } = actingSeat(state);
  const round = state.betting;
  assert.ok(round, "a betting round is open");
  const bounds = bettingBounds(state.seats, round, index, state.stakes.bigBlind);
  assert.ok(bounds, `seat ${index} can act`);

  return bounds.canCheck ? { type: "check", playerId: id } : { type: "call", playerId: id };
}

/**
 * Plays the hand politely to §19's window (or an earlier end): the pre-flop blinds are called
 * around — the big blind checks, since its own blind is already the round's bet — and every
 * street after it is checked around.
 */
function playToWindow(state: OfflineState, fromMs = NOW): OfflineState {
  let next = state;
  let step = 0;

  while (next.wordWindow?.status !== "open" && next.phase !== "payout") {
    next = reduce(next, politeAction(next), fromMs + step);
    step += 1;
    assert.ok(step <= SEATS.length * ROUND_PHASES.length, "a polite hand is a bounded walk");
  }

  return next;
}

/** §19's window closed with the clock run out, which is how a hand reaches its payout. */
function payOut(state: OfflineState): OfflineState {
  return reduce(state, { type: "timeoutWords" }, state.endsAtMs);
}

/** Plays a named sequence of actions, each on its own clock reading. */
function play(state: OfflineState, actions: readonly OfflineAction[], fromMs = NOW): OfflineState {
  return actions.reduce((next, action, step) => reduce(next, action, fromMs + step), state);
}

/** Every chip in the middle: what the seats have committed to this hand (§25). */
function potOf(state: OfflineState): number {
  return state.seats.reduce((total, seat) => total + seat.committedHand, 0);
}

/** What the streets reveal, in order: the contract the whole slice hangs off. */
const REVEALS = [
  { phase: "preflop", revealed: 0 },
  { phase: "flop", revealed: 3 },
  { phase: "turn", revealed: 4 },
  { phase: "river", revealed: 5 },
  { phase: "payout", revealed: 5 },
] as const;

describe("startHand", () => {
  it("deals two private tiles per seat and the whole five-tile board", () => {
    const state = dealHand();

    assert.equal(state.hand, 1);
    assert.equal(state.seed, SEED);
    assert.equal(state.phase, "preflop");
    assert.equal(state.seats.length, SEATS.length);
    for (const seat of state.seats) {
      assert.equal(seat.privateTiles.length, PRIVATE_TILES_PER_PLAYER);
    }
    assert.equal(state.community.length, COMMUNITY_TILE_COUNT);
    assert.equal(state.revealed, 0);
    assert.equal(state.seats[0]?.stack, 1_000);
    assert.deepEqual(state.betting, { currentBet: BIG_BLIND, lastRaiseSize: 0 });
    assert.equal(state.sessionOver, false);
  });

  it("posts the blinds before any tile is dealt (§5, §14)", () => {
    const state = dealHand();

    assert.deepEqual(state.stakes, { smallBlind: SMALL_BLIND, bigBlind: BIG_BLIND });
    assert.deepEqual(state.seats.map((seat) => seat.stack), [1_000, 990, 980, 1_000]);
    // The posts are the blinds' Committed This Round and Committed This Hand (§23, §22).
    assert.deepEqual(state.seats.map((seat) => seat.committedRound), [0, SMALL_BLIND, BIG_BLIND, 0]);
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, SMALL_BLIND, BIG_BLIND, 0]);
    assert.equal(potOf(state), SMALL_BLIND + BIG_BLIND);
    // Posting a blind is not acting: both blind seats still have their turn (§15).
    assert.deepEqual(state.seats.map((seat) => seat.actedThisRound), [false, false, false, false]);
  });

  it("arms the first turn's deadline from the injected clock", () => {
    assert.equal(dealHand({}, NOW).endsAtMs, NOW + OFFLINE_TURN_MS);
  });

  it("opens the round at the first dealt-in seat clockwise from the big blind (§15)", () => {
    assert.equal(dealHand().toActIndex, FIRST_TO_ACT);
    // A button at seat 2 puts the blinds on 3 and 0, so the walk starts at seat 1.
    assert.equal(dealHand({ dealerSeat: 2 }).toActIndex, 1);
    assert.equal(dealHand({ dealerSeat: 3 }).toActIndex, 2);
  });

  it("posts the button's own small blind and opens with the button heads-up (§5, §15)", () => {
    const state = dealHand({ players: ["hero", "ellis"] });

    assert.equal(state.dealerSeat, 0);
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [SMALL_BLIND, BIG_BLIND]);
    // The button is the small blind, and the small blind is the first to act heads-up.
    assert.equal(state.toActIndex, 0);
  });

  it("moves the button off a seat that is not dealt in (§5)", () => {
    const state = dealHand({ stacks: [{ playerId: "hero", stack: 0 }] });

    // Seat 0 cannot play, so the button steps to seat 1 — a sitting-out seat forces no blinds.
    assert.equal(state.seats[0]?.sittingOut, true);
    assert.equal(state.dealerSeat, 1);
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, 0, SMALL_BLIND, BIG_BLIND]);
    assert.equal(state.toActIndex, 1);
  });

  it("seats each player on the stack it was carried in with", () => {
    const state = dealHand({ stacks: [{ playerId: "hero", stack: 640 }, { playerId: "ellis", stack: 2_500 }] });

    assert.deepEqual(
      state.seats.map((seat) => seat.stack),
      [640, 2_500 - SMALL_BLIND, 1_000 - BIG_BLIND, 1_000],
    );
  });

  it("seats a busted seat out instead of dealing it a hand it cannot pay (ADR 0002)", () => {
    const state = dealHand({ stacks: [{ playerId: "ellis", stack: 0 }] });

    assert.equal(state.seats[1]?.stack, 0);
    assert.equal(state.seats[1]?.sittingOut, true);
    // ellis cannot hold the small blind, so the blinds are jay's and mira's and the walk from the
    // big blind wraps to hero.
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, 0, SMALL_BLIND, BIG_BLIND]);
    assert.equal(state.toActIndex, 0);
  });

  it("refuses a hand fewer than two seats can play", () => {
    assert.throws(
      () =>
        dealHand({
          stacks: [
            { playerId: "ellis", stack: 0 },
            { playerId: "jay", stack: 0 },
            { playerId: "mira", stack: 0 },
          ],
        }),
      OfflineActionError,
    );
  });

  it("takes its stakes from the table, not from buried constants", () => {
    const state = dealHand({ stakes: { smallBlind: 5, bigBlind: 50, startingStack: 500 } });

    assert.equal(state.stakes.smallBlind, 5);
    assert.equal(state.stakes.bigBlind, 50);
    assert.equal(state.seats[0]?.stack, 500);
    // The table's own blinds are the ones posted, and the big blind is the opening Current Bet.
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, 5, 50, 0]);
    assert.equal(state.betting?.currentBet, 50);
    // A raise must still add the larger of that big blind and the last increment: the floor is
    // 50 + 50, so a raise to the 80 that clears the old default is refused.
    assert.throws(
      () => reduce(state, { type: "raise", playerId: "mira", amount: 80 }, NOW),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "below-min-raise",
    );
  });

  it("posts a big blind shorter than its blind all in, with the full blind still the round's bet (§22, §23)", () => {
    const state = dealHand({ stacks: [{ playerId: "jay", stack: 5 }] });

    // jay posts the 5 it holds and is all in; the blind it could not pay does not shrink the
    // round's Current Bet, so the seats behind it still owe the whole big blind.
    assert.equal(state.seats[BIG_BLIND_SEAT]?.allIn, true);
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, SMALL_BLIND, 5, 0]);
    assert.equal(state.betting?.currentBet, BIG_BLIND);

    const bounds = bettingBounds(state.seats, { currentBet: BIG_BLIND, lastRaiseSize: 0 }, FIRST_TO_ACT, BIG_BLIND);
    assert.equal(bounds?.callAmount, BIG_BLIND);
  });

  it("posts a short small blind all in and plays the hand on", () => {
    const state = dealHand({ stacks: [{ playerId: "ellis", stack: 5 }] });

    assert.equal(state.seats[SMALL_BLIND_SEAT]?.allIn, true);
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [0, 5, BIG_BLIND, 0]);

    // The walk skips the all-in small blind and reaches the big blind's option, which closes the
    // street: the short blind keeps its 5 in the pot and its word to build (§19).
    const flop = play(state, [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "check", playerId: "jay" },
    ]);

    assert.equal(flop.phase, "flop");
    assert.deepEqual(flop.seats.map((seat) => seat.committedHand), [BIG_BLIND, 5, BIG_BLIND, BIG_BLIND]);
    assert.equal(flop.seats[SMALL_BLIND_SEAT]?.allIn, true);
  });

  it("rolls a hand whose whole table is all in on the posts to §19's window (§13)", () => {
    const state = dealHand({
      players: ["hero", "ellis"],
      stacks: [{ playerId: "hero", stack: 5 }, { playerId: "ellis", stack: 5 }],
    });

    // Both blinds posted all either seat had, so no seat can act on any street: the hand goes
    // straight to the window, exactly as a closed all-in round does.
    assert.equal(state.betting, null);
    assert.equal(state.toActIndex, null);
    assert.equal(state.phase, "river");
    assert.equal(state.revealed, 5);
    assert.equal(state.wordWindow?.status, "open");
  });

  it("deals every tile once across the table", () => {
    const state = dealHand();
    const ids = [
      ...state.seats.flatMap((seat) => seat.privateTiles.map((tile) => tile.id)),
      ...state.community.map((tile) => tile.id),
    ];

    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, SEATS.length * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT);
  });

  it("replays the same hand for the same seed", () => {
    assert.deepEqual(dealHand(), dealHand());
    assert.notDeepEqual(
      dealHand(),
      startHand({ seed: SEED + 1, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY }),
    );
  });

  it("seats the players in the order it was given", () => {
    assert.deepEqual(
      dealHand().seats.map((seat) => seat.id),
      [...SEATS],
    );
  });
});

describe("reduce — the betting round", () => {
  it("walks the blinds around, and the big blind's check closes the round", () => {
    let state = dealHand();

    assert.equal(state.toActIndex, FIRST_TO_ACT);
    state = reduce(state, { type: "call", playerId: "mira" }, NOW);
    assert.equal(state.seats[FIRST_TO_ACT]?.committedRound, BIG_BLIND);
    assert.equal(state.toActIndex, 0);

    state = reduce(state, { type: "call", playerId: "hero" }, NOW + 1);
    assert.equal(state.toActIndex, SMALL_BLIND_SEAT);

    // The small blind owes the difference between its blind and the big blind, and only that.
    state = reduce(state, { type: "call", playerId: "ellis" }, NOW + 2);
    assert.equal(state.seats[SMALL_BLIND_SEAT]?.committedRound, BIG_BLIND);

    // Back at the big blind, whose own blind is already the Current Bet (§15's option).
    assert.equal(state.toActIndex, BIG_BLIND_SEAT);
    state = reduce(state, { type: "check", playerId: "jay" }, NOW + 3);

    // Every seat matched, so the round closed and the street rolled: the hand keeps what was
    // committed, the round starts over with no blinds in it.
    assert.equal(state.phase, "flop");
    assert.deepEqual(state.betting, { currentBet: 0, lastRaiseSize: 0 });
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [BIG_BLIND, BIG_BLIND, BIG_BLIND, BIG_BLIND]);
    assert.deepEqual(state.seats.map((seat) => seat.committedRound), [0, 0, 0, 0]);
    // §15: after the flop the walk starts at the first dealt-in seat clockwise from the button.
    assert.equal(state.toActIndex, SMALL_BLIND_SEAT);
  });

  it("re-opens the round when the big blind raises, and settles it when the callers answer", () => {
    let state = dealHand();
    state = play(state, [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
      { type: "raise", playerId: "jay", amount: 60 },
    ]);

    // The big blind's raise is a full raise: every other live seat is back on the hook.
    assert.equal(state.betting?.currentBet, 60);
    assert.equal(state.betting?.lastRaiseSize, 40);
    assert.equal(state.toActIndex, FIRST_TO_ACT);
    assert.deepEqual(state.seats.map((seat) => seat.actedThisRound), [false, false, true, false]);

    state = play(state, [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
    ]);

    assert.equal(state.phase, "flop");
    assert.deepEqual(state.seats.map((seat) => seat.committedHand), [60, 60, 60, 60]);
  });

  it("re-arms the deadline from the clock the action carried", () => {
    const state = reduce(dealHand(), { type: "call", playerId: "mira" }, NOW + 5_000);

    assert.equal(state.endsAtMs, NOW + 5_000 + OFFLINE_TURN_MS);
  });

  it("folds the big blind's option when its turn expires, though it owed nothing (§15, ADR 0006)", () => {
    const state = play(dealHand(), [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
    ]);

    // The big blind owes nothing and could have checked; the rules revision folds it anyway, so
    // the round closes on the fold rather than on a check the seat never chose.
    const timedOut = reduce(state, { type: "timeoutTurn" }, state.endsAtMs);

    assert.equal(timedOut.seats[BIG_BLIND_SEAT]?.folded, true);
    assert.equal(timedOut.phase, "flop", "the seats that matched roll the street on");
  });

  it("auto-folds an idle seat that owes chips when its turn expires", () => {
    const state = dealHand();
    const timedOut = reduce(state, { type: "timeoutTurn" }, state.endsAtMs);

    // Pre-flop the first seat to act already owes the big blind, so its clock folds it.
    assert.equal(timedOut.seats[FIRST_TO_ACT]?.folded, true);
    assert.equal(timedOut.seats[FIRST_TO_ACT]?.committedHand, 0);
    assert.equal(timedOut.toActIndex, 0);
  });

  it("refuses a timeout before the deadline and refuses late voluntary action", () => {
    const state = dealHand();
    assert.throws(
      () => reduce(state, { type: "timeoutTurn" }, state.endsAtMs - 1),
      OfflineActionError,
    );
    assert.throws(
      () => reduce(state, { type: "call", playerId: "mira" }, state.endsAtMs),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "turn-timeout",
    );
  });

  it("server-folds the acting seat at the deadline, and the fold-out pays (§29)", () => {
    const state = dealHand({ players: ["hero", "ellis"] });
    const { index, id } = actingSeat(state);

    // Heads-up the button holds the small blind, so the seat the clock takes is the small blind.
    assert.equal(id, "hero");
    const folded = reduce(state, { type: "foldTurn" }, state.endsAtMs);

    assert.equal(folded.seats[index]?.folded, true);
    assert.equal(folded.phase, "payout", "the last seat standing takes the pot (§26)");
    assert.equal(folded.result?.winner, "ellis");
    // The blinds both posted stay in: the big blind takes the pot it posted into.
    assert.equal(potOf(folded), SMALL_BLIND + BIG_BLIND);
    assert.deepEqual(folded.seats.map((seat) => seat.stack), [990, 1_010]);
  });

  it("server-folds the acting seat before the deadline too — the onLeave path (§29)", () => {
    const state = dealHand();
    const { index } = actingSeat(state);

    const folded = reduce(state, { type: "foldTurn" }, state.endsAtMs - 1);

    assert.equal(folded.seats[index]?.folded, true);
    assert.equal(folded.phase, "preflop", "the hand goes on with the seats that remain");
    assert.equal(folded.toActIndex, 0);
  });

  it("refuses a server fold when no betting round is open", () => {
    const state = playToWindow(dealHand());
    assert.equal(state.wordWindow?.status, "open");

    assert.throws(() => reduce(state, { type: "foldTurn" }, state.endsAtMs), OfflineActionError);
  });

  it("carries a configured turn duration into the next hand", () => {
    let state = dealHand({ turnDurationMs: 5_000 });
    assert.equal(state.endsAtMs, NOW + 5_000);
    state = payOut(playToWindow(state));
    const next = reduce(state, { type: "deal" }, NOW + 10_000);

    assert.equal(next.turnDurationMs, 5_000);
    assert.equal(next.endsAtMs, NOW + 10_000 + 5_000);
  });

  it("refuses an action from the wrong seat, with the machine's reason", () => {
    const state = dealHand();

    assert.throws(
      () => reduce(state, { type: "check", playerId: "hero" }, NOW),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "not-your-turn",
    );
  });

  it("refuses a check while facing a bet — pre-flop the big blind is that bet", () => {
    const state = dealHand();

    assert.throws(
      () => reduce(state, { type: "check", playerId: "mira" }, NOW),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "check-facing-bet",
    );
  });
});

describe("reduce — streets", () => {
  it("walks preflop to payout revealing 0/3/4/5", () => {
    let state = dealHand();

    for (const { phase, revealed } of REVEALS) {
      // The last street's round opens §19's window rather than paying out, so the hand
      // reaches its payout by closing that window.
      if (phase === "payout") {
        state = payOut(state);
      }

      assert.equal(state.phase, phase);
      assert.equal(state.revealed, revealed);
      assert.equal(state.revealed, revealedCount(phase));

      if (phase !== "payout") {
        // Every seat takes one polite action on the street, and the round's last closes it.
        for (let seat = 0; seat < SEATS.length; seat += 1) {
          state = reduce(state, politeAction(state), NOW + seat);
        }
      }
    }
  });

  it("has nobody to act once the hand has paid out", () => {
    const payout = payOut(playToWindow(dealHand()));

    assert.equal(payout.phase, "payout");
    assert.equal(payout.toActIndex, null);
    assert.equal(payout.betting, null);
    assert.equal(payout.revealed, 5);
  });

  it("keeps the whole board down until the flop", () => {
    const preflop = dealHand();
    const rolled = play(preflop, [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
      { type: "check", playerId: "jay" },
    ]);

    assert.deepEqual(preflop.community, rolled.community);
    assert.equal(preflop.community.length, 5);
  });

  it("names the streets in the order the contract declares them", () => {
    assert.deepEqual(
      REVEALS.map((entry) => entry.phase),
      [...ROUND_PHASES],
    );
  });
});

describe("reduce — folds and all-ins", () => {
  it("ends a fold-out at the pot, with no window and no reveal (§26)", () => {
    // mira raises over the blinds and everyone else gives the hand up: the last seat standing
    // takes every pot, and there is no reveal to write.
    const state = play(dealHand(), [
      { type: "raise", playerId: "mira", amount: 100 },
      { type: "fold", playerId: "hero" },
      { type: "fold", playerId: "ellis" },
      { type: "fold", playerId: "jay" },
    ]);

    assert.equal(state.phase, "payout");
    assert.equal(state.wordWindow, null);
    assert.equal(state.betting, null);
    assert.equal(state.toActIndex, null);
    assert.equal(state.endsAtMs, NOW + 3);
    assert.deepEqual(state.result?.standings, []);
    assert.deepEqual(state.result?.comparisons, []);
    assert.equal(state.result?.winner, "mira");

    // Both blinds and mira's raise are in the pot, and the seats that folded keep their loss.
    const pots = state.result?.payout.pots ?? [];
    assert.equal(pots.reduce((total, pot) => total + pot.amount, 0), 130);
    assert.ok(pots.every((pot) => pot.ranking === null && pot.winners.join() === "mira"));
    assert.deepEqual(state.result?.payout.stackDeltas, [
      { playerId: "hero", start: 1_000, end: 1_000 },
      { playerId: "ellis", start: 1_000, end: 990 },
      { playerId: "jay", start: 1_000, end: 980 },
      { playerId: "mira", start: 1_000, end: 1_030 },
    ]);
  });

  it("runs an all-in preflop through the streets to §19's window in one transition", () => {
    const state = play(dealHand(), [
      { type: "allIn", playerId: "mira" },
      { type: "fold", playerId: "hero" },
      { type: "fold", playerId: "ellis" },
      { type: "call", playerId: "jay" },
    ]);

    assert.equal(state.phase, "river");
    assert.equal(state.revealed, 5);
    assert.equal(state.betting, null);
    assert.equal(state.endsAtMs, NOW + 3 + WORD_WINDOW_MS);
    assert.equal(state.wordWindow?.status, "open");
    // Only the seats still in the hand build a word; the folded seats are simply not there.
    assert.deepEqual(
      (state.wordWindow?.slots ?? []).map((slot) => slot.playerId),
      ["jay", "mira"],
    );

    const paid = payOut(state);
    assert.equal(potOf(paid), 2_010);
    const stacks = paid.seats.map((seat) => seat.stack);
    assert.deepEqual([...stacks].sort((a, b) => a - b), [0, 990, 1_000, 2_010]);
  });

  it("keeps a folded seat out of the window even when the hand plays on", () => {
    const preflop = play(dealHand(), [
      { type: "raise", playerId: "mira", amount: 40 },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
      { type: "fold", playerId: "jay" },
    ]);

    const window = playToWindow(preflop, NOW + 4);

    assert.equal(window.wordWindow?.status, "open");
    // jay folded at seat 2; the window holds hero, ellis and mira, and nobody else.
    assert.deepEqual(
      (window.wordWindow?.slots ?? []).map((slot) => slot.seat),
      [0, 1, 3],
    );
  });
});

describe("reduce — session end and rollover", () => {
  /** A hand paid out with every seat all in: exactly one seat survives with the chips. */
  function allInPayout(): OfflineState {
    const state = play(dealHand(), [
      { type: "allIn", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "call", playerId: "ellis" },
      { type: "call", playerId: "jay" },
    ]);

    return payOut(state);
  }

  it("deals a fresh hand from the last one's seed, carrying stacks and stepping the button", () => {
    const payout = payOut(playToWindow(dealHand()));
    const next = reduce(payout, { type: "deal" }, NOW);

    assert.equal(next.hand, 2);
    assert.equal(next.seed, payout.seed + payout.hand);
    assert.equal(next.phase, "preflop");
    assert.equal(next.revealed, 0);
    assert.equal(next.dealerSeat, 1);
    // The button moved to seat 1, so the blinds are seats 2 and 3 and the walk starts at hero.
    assert.deepEqual(next.seats.map((seat) => seat.committedHand), [0, 0, SMALL_BLIND, BIG_BLIND]);
    assert.equal(next.toActIndex, 0);
    // Every seat carried its last hand's chips in, and then posted the blinds.
    assert.deepEqual(
      next.seats.map((seat) => seat.stack),
      payout.seats.map((seat, index) =>
        index === 2 ? seat.stack - SMALL_BLIND : index === 3 ? seat.stack - BIG_BLIND : seat.stack,
      ),
    );
    assert.notDeepEqual(
      next.seats.map((seat) => seat.privateTiles),
      payout.seats.map((seat) => seat.privateTiles),
    );
  });

  it("ends the session instead of dealing when fewer than two seats can play", () => {
    const payout = allInPayout();
    const survivors = payout.seats.filter((seat) => seat.stack > 0);

    assert.equal(survivors.length, 1);
    assert.equal(survivors[0]?.stack, 4_000);

    const ended = reduce(payout, { type: "deal" }, NOW);

    assert.equal(ended.sessionOver, true);
    assert.equal(ended.phase, "payout");
    assert.deepEqual(ended.result, payout.result);
    assert.throws(() => reduce(ended, { type: "deal" }, NOW + 1), OfflineActionError);
  });

  it("replays the run from the first seed, stacks and payout included", () => {
    const payout = payOut(playToWindow(dealHand()));
    const once = reduce(payout, { type: "deal" }, NOW);
    const twice = reduce(payOut(playToWindow(dealHand())), { type: "deal" }, NOW);

    assert.deepEqual(once, twice);
  });

  it("plays the same chips for the same seed and the same action script", () => {
    const script: readonly OfflineAction[] = [
      { type: "call", playerId: "mira" },
      { type: "call", playerId: "hero" },
      { type: "fold", playerId: "ellis" },
      { type: "fold", playerId: "jay" },
    ];

    const play_ = (): OfflineState => {
      const state = play(dealHand(), script);
      return reduce(payOut(playToWindow(state, NOW + script.length)), { type: "deal" }, NOW);
    };

    const first = play_();
    const again = play_();

    assert.deepEqual(first, again);
    assert.deepEqual(
      first.seats.map((seat) => seat.stack),
      again.seats.map((seat) => seat.stack),
    );
  });
});

describe("reduce — illegal actions", () => {
  it("refuses a deal while the hand is still being played", () => {
    for (const steps of [0, 1, SEATS.length, SEATS.length * 2]) {
      let state = dealHand();
      for (let step = 0; step < steps; step += 1) {
        state = reduce(state, politeAction(state), NOW + step);
      }

      assert.throws(
        () => reduce(state, { type: "deal" }, NOW),
        (error: unknown) =>
          error instanceof OfflineActionError &&
          error.name === "OfflineActionError" &&
          error.message.includes(state.phase),
        `expected a refusal at ${state.phase}`,
      );
    }
  });

  it("refuses a betting action while §19's window is open, and after the payout", () => {
    const window = playToWindow(dealHand());

    assert.throws(
      () => reduce(window, { type: "check", playerId: "hero" }, window.endsAtMs - 1),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "hand-over",
    );

    const payout = payOut(window);
    assert.throws(
      () => reduce(payout, { type: "allIn", playerId: "hero" }, NOW),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "hand-over",
    );
  });

  it("never mutates the state it was handed", () => {
    const state = dealHand();
    const before = cloneState(state);

    reduce(state, { type: "call", playerId: "mira" }, NOW + 1);
    assert.throws(() => reduce(state, { type: "check", playerId: "hero" }, NOW + 1));

    assert.deepEqual(state, before);
  });
});

describe("reduce — §44's Power Draw", () => {
  const CPU = ["ellis", "jay", "mira"] as const;

  function wildHand(options: Partial<StartHandOptions> = {}, nowMs = NOW): OfflineState {
    return dealHand({ powerUps: { deal: "choose3", bots: CPU }, ...options }, nowMs);
  }

  function drawOf(state: OfflineState): PowerDraw {
    assert.ok(state.powers, "a Wild hand carries its powers");
    return state.powers.draw;
  }

  function offersOf(state: OfflineState, playerId: string): readonly PowerUpId[] {
    const slot = drawOf(state).slots.find((candidate) => candidate.playerId === playerId);
    assert.ok(slot, `${playerId} draws`);
    return slot.offers;
  }

  it("leaves a Classic hand exactly as it was", () => {
    const classic = dealHand({ powerUps: { deal: "off" } });

    assert.deepEqual(classic, dealHand());
    assert.ok(!("powers" in classic), "a Classic hand has no powers field at all");
  });

  it("deals the same tiles and posts the same blinds with power-ups on or off", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const off = dealHand({ seed });
      const on = dealHand({ seed, powerUps: { deal: "choose3" } });

      assert.deepEqual(on.community, off.community, `seed ${seed}: the board`);
      assert.deepEqual(on.seats, off.seats, `seed ${seed}: the racks and the blinds`);
    }
  });

  it("opens the draw before pre-flop's first turn, for every seat but the CPU", () => {
    const state = wildHand();

    assert.equal(state.phase, "preflop");
    assert.equal(state.toActIndex, null, "nobody is on the clock while the draw is open");
    assert.equal(state.endsAtMs, NOW + POWER_DRAW_MS, "the table's clock is the draw's");
    assert.equal(state.powers?.firstToAct, FIRST_TO_ACT);
    assert.deepEqual(state.powers?.held, {});
    assert.deepEqual(
      drawOf(state).slots.map(({ seat, playerId }) => ({ seat, playerId })),
      [{ seat: 0, playerId: "hero" }],
    );
    assert.deepEqual(offersOf(state, "hero"), drawOffers(SEED, 0));
  });

  it("offers every seat dealt in when no seat is a bot", () => {
    const state = dealHand({ powerUps: { deal: "choose3" } });

    assert.deepEqual(drawOf(state).slots.map((slot) => slot.playerId), [...SEATS]);
  });

  it("refuses every betting action while the draw is open", () => {
    const state = wildHand();
    const before = cloneState(state);

    assert.throws(
      () => reduce(state, { type: "call", playerId: "mira" }, NOW + 1),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "power-draw",
    );
    assert.throws(() => reduce(state, { type: "timeoutTurn" }, NOW + OFFLINE_TURN_MS), OfflineActionError);
    assert.deepEqual(state, before);
  });

  it("closes the moment the last seat picks and puts pre-flop's first seat on the clock", () => {
    const state = wildHand();
    const pick = offersOf(state, "hero")[2];
    assert.ok(pick);

    const picked = reduce(state, { type: "pickPower", playerId: "hero", powerUpId: pick }, NOW + 500);

    assert.equal(picked.powers?.draw.status, "closed");
    assert.deepEqual(picked.powers?.held, { hero: { id: pick, used: false } });
    assert.equal(picked.toActIndex, FIRST_TO_ACT);
    assert.equal(picked.endsAtMs, NOW + 500 + OFFLINE_TURN_MS, "the turn clock starts at the close");
    // Betting is open now, and the hand plays through to §19's window as any hand does.
    assert.equal(playToWindow(picked, NOW + 501).wordWindow?.status, "open");
  });

  it("waits for every drawing seat before it closes", () => {
    const state = dealHand({ powerUps: { deal: "choose3" } });
    const pick = offersOf(state, "hero")[0];
    assert.ok(pick);

    const one = reduce(state, { type: "pickPower", playerId: "hero", powerUpId: pick }, NOW + 1);

    assert.equal(one.powers?.draw.status, "open");
    assert.equal(one.toActIndex, null);
    assert.throws(
      () => reduce(one, { type: "pickPower", playerId: "hero", powerUpId: pick }, NOW + 2),
      (error: unknown) => error instanceof PowerRejectionError && error.reason === "already-picked",
    );
  });

  it("keeps the first offer for a seat the clock ran out on", () => {
    const state = wildHand();
    const deadline = state.endsAtMs;

    assert.throws(() => reduce(state, { type: "timeoutPowerDraw" }, deadline - 1), OfflineActionError);
    const closed = reduce(state, { type: "timeoutPowerDraw" }, deadline);

    assert.deepEqual(closed.powers?.held, { hero: { id: offersOf(state, "hero")[0], used: false } });
    assert.equal(closed.toActIndex, FIRST_TO_ACT);
    assert.equal(closed.endsAtMs, deadline + OFFLINE_TURN_MS);
  });

  it("refuses a pick at a Classic table", () => {
    assert.throws(
      () => reduce(dealHand(), { type: "pickPower", playerId: "hero", powerUpId: "mulligan" }, NOW),
      (error: unknown) => error instanceof PowerRejectionError && error.reason === "not-in-draw",
    );
    assert.throws(() => reduce(dealHand(), { type: "timeoutPowerDraw" }, NOW), OfflineActionError);
  });

  it("rolls to §19's window after the draw when the blinds put every seat all in", () => {
    const state = dealHand({
      players: ["hero", "ellis"],
      stacks: [
        { playerId: "hero", stack: SMALL_BLIND },
        { playerId: "ellis", stack: BIG_BLIND },
      ],
      powerUps: { deal: "choose3" },
    });

    assert.equal(state.powers?.draw.status, "open", "the draw still runs; the power is for §19");
    assert.equal(state.wordWindow, null);

    const closed = reduce(state, { type: "timeoutPowerDraw" }, state.endsAtMs);
    assert.equal(closed.phase, "river");
    assert.equal(closed.wordWindow?.status, "open");
  });

  it("clears every held power on the next deal and draws again from the new seed", () => {
    const first = wildHand();
    const pick = offersOf(first, "hero")[0];
    assert.ok(pick);
    const played = playToWindow(
      reduce(first, { type: "pickPower", playerId: "hero", powerUpId: pick }, NOW + 1),
      NOW + 2,
    );
    const next = reduce(payOut(played), { type: "deal" }, NOW + 10_000);

    assert.equal(next.hand, 2);
    assert.equal(next.powers?.draw.status, "open");
    assert.deepEqual(next.powers?.held, {});
    assert.deepEqual(next.powers?.bots, CPU);
    assert.deepEqual(offersOf(next, "hero"), drawOffers(next.seed, 0));
  });
});

describe("reduce — §44's held power", () => {
  const CPU = ["ellis", "jay", "mira"] as const;
  const HERO = 0;

  /** A Wild hand where the hero kept `power` and the draw has closed: mira is on the clock. */
  function holding(power: PowerUpId, options: Partial<StartHandOptions> = {}): OfflineState {
    const state = dealHand({ powerUps: { deal: "choose3", bots: CPU }, ...options });
    return reduce(state, { type: "pickPower", playerId: "hero", powerUpId: power }, NOW + 1);
  }

  /** The hero's first betting turn: pre-flop, mira acts before it. */
  function heroOnTurn(power: PowerUpId): OfflineState {
    let state = holding(power);
    while (state.toActIndex !== HERO) state = reduce(state, politeAction(state), NOW + 2);
    return state;
  }

  function use(
    state: OfflineState,
    tileId: string,
    powerUpId: PowerUpId = "random_wild",
    nowMs = NOW + 3,
    playerId = "hero",
  ): OfflineState {
    return reduce(state, { type: "usePowerUp", playerId, powerUpId, tileId }, nowMs);
  }

  function heroTile(state: OfflineState, index = 0): Tile {
    const tile = state.seats[HERO]?.privateTiles[index];
    assert.ok(tile, `the hero's tile ${index}`);
    return tile;
  }

  /** A play of `tile` as itself: a choice tile names its first face. */
  function playOf(tile: Tile): TilePlay {
    return "alternativeLetter" in tile ? { tileId: tile.id, chosenFace: tile.letter } : { tileId: tile.id };
  }

  function refused(reason: PowerRejectionReason): (error: unknown) => boolean {
    return (error) => error instanceof PowerRejectionError && error.reason === reason;
  }

  it("swaps the tile in place on the seat's own turn, and the turn goes on", () => {
    const state = heroOnTurn("random_wild");
    const discarded = heroTile(state, 0);
    const kept = heroTile(state, 1);
    const tile = swapTile("random_wild", { dealSeed: SEED, seat: HERO });

    const used = use(state, discarded.id);

    assert.deepEqual(used.seats[HERO]?.privateTiles, [tile, kept], "the new tile takes the old one's place");
    assert.deepEqual(used.powers?.held.hero, {
      id: "random_wild",
      used: true,
      swap: { discardedTileId: discarded.id, tile },
    });
    // Not a betting action: the same seat is on the same clock, and every other seat is untouched.
    assert.equal(used.toActIndex, HERO);
    assert.equal(used.endsAtMs, state.endsAtMs);
    assert.deepEqual(used.betting, state.betting);
    assert.deepEqual(used.seats.slice(1), state.seats.slice(1));
    assert.deepEqual(used.community, state.community);
    assert.equal(reduce(used, politeAction(used), NOW + 4).toActIndex, HERO + 1, "the hero still acts");
  });

  it("gives the seat the same letter whichever street it is used on", () => {
    for (const power of ["random_wild", "vowel_magnet"] as const) {
      const early = heroOnTurn(power);
      const onPreflop = use(early, heroTile(early).id, power);

      const late = playToWindow(holding(power), NOW + 2);
      assert.equal(late.phase, "river");
      const inWindow = use(late, heroTile(late).id, power, late.endsAtMs - 1);

      assert.deepEqual(heroTile(inWindow), heroTile(onPreflop), power);
    }
  });

  it("draws Vowel Magnet's letter from the vowels", () => {
    const state = heroOnTurn("vowel_magnet");
    const used = use(state, heroTile(state).id, "vowel_magnet");

    assert.match(heroTile(used).letter, /^[AEIOU]$/);
  });

  it("refuses a second use in the same hand, leaving the first swap alone", () => {
    const state = heroOnTurn("random_wild");
    const used = use(state, heroTile(state, 0).id);
    const before = cloneState(used);

    assert.throws(() => use(used, heroTile(used, 1).id, "random_wild", NOW + 4), refused("already-used"));
    assert.throws(() => use(used, heroTile(used, 0).id, "random_wild", NOW + 4), refused("already-used"));
    assert.deepEqual(used, before);
  });

  it("refuses a power at a Classic table", () => {
    const state = dealHand();

    assert.throws(() => use(state, heroTile(state).id), refused("powers-off"));
  });

  it("refuses a power the seat does not hold, and a CPU seat, which holds none", () => {
    const state = heroOnTurn("random_wild");
    assert.throws(() => use(state, heroTile(state).id, "vowel_magnet"), refused("not-held"));

    const mira = holding("random_wild");
    const miraTile = mira.seats[FIRST_TO_ACT]?.privateTiles[0];
    assert.ok(miraTile);
    assert.throws(() => use(mira, miraTile.id, "random_wild", NOW + 2, "mira"), refused("not-held"));
  });

  it("refuses a power off the seat's own turn, and once its clock has run out", () => {
    const waiting = holding("random_wild");
    assert.equal(waiting.toActIndex, FIRST_TO_ACT);
    assert.throws(() => use(waiting, heroTile(waiting).id), refused("outside-window"));

    const onTurn = heroOnTurn("random_wild");
    assert.throws(
      () => use(onTurn, heroTile(onTurn).id, "random_wild", onTurn.endsAtMs),
      refused("outside-window"),
    );
  });

  it("refuses a power while the Power Draw is still open, even to a seat that has picked", () => {
    const state = dealHand({ powerUps: { deal: "choose3" } });
    const picked = reduce(state, { type: "pickPower", playerId: "hero", powerUpId: "random_wild" }, NOW + 1);

    assert.equal(picked.powers?.draw.status, "open");
    assert.throws(() => use(picked, heroTile(picked).id, "random_wild", NOW + 2), refused("outside-window"));
  });

  it("refuses a power after §19's clock runs out, and after the payout", () => {
    const window = playToWindow(holding("random_wild"), NOW + 2);
    assert.throws(
      () => use(window, heroTile(window).id, "random_wild", window.endsAtMs),
      refused("outside-window"),
    );

    const paid = payOut(window);
    assert.throws(() => use(paid, heroTile(paid).id, "random_wild", paid.endsAtMs + 1), refused("outside-window"));
  });

  it("refuses a power once the seat has folded", () => {
    const state = heroOnTurn("random_wild");
    const folded = reduce(state, { type: "fold", playerId: "hero" }, NOW + 3);

    assert.throws(() => use(folded, heroTile(folded).id, "random_wild", NOW + 4), refused("folded"));
  });

  it("refuses a power once the seat has confirmed its word", () => {
    const window = playToWindow(holding("random_wild"), NOW + 2);
    const plays = [playOf(heroTile(window, 0)), playOf(heroTile(window, 1))];
    const confirmed = reduce(
      window,
      { type: "confirmWord", playerId: "hero", submission: { plays } },
      window.endsAtMs - 10,
    );

    assert.equal(confirmed.wordWindow?.status, "open", "the other seats are still building");
    assert.throws(
      () => use(confirmed, heroTile(confirmed).id, "random_wild", confirmed.endsAtMs - 5),
      refused("word-confirmed"),
    );
  });

  it("refuses a tile that is not one of the seat's private tiles", () => {
    const state = heroOnTurn("random_wild");
    const board = state.community[0];
    const theirs = state.seats[1]?.privateTiles[0];
    assert.ok(board && theirs);

    assert.throws(() => use(state, board.id), refused("not-your-tile"));
    assert.throws(() => use(state, theirs.id), refused("not-your-tile"));
    assert.equal(state.powers?.held.hero?.used, false, "a refused use spends nothing");
  });

  it("takes the discarded tile out of the seat's draft in §19's window, keeping the rest in order", () => {
    const window = playToWindow(holding("random_wild"), NOW + 2);
    const [first, second] = [heroTile(window, 0), heroTile(window, 1)];
    const board = window.community.find((tile) => !("alternativeLetter" in tile));
    assert.ok(board);
    const plays = [playOf(first), playOf(board), playOf(second)];
    const drafted = reduce(
      window,
      { type: "draftWord", playerId: "hero", submission: { plays } },
      window.endsAtMs - 10,
    );

    const used = use(drafted, first.id, "random_wild", drafted.endsAtMs - 5);
    const slot = used.wordWindow?.slots.find((candidate) => candidate.playerId === "hero");

    assert.deepEqual(slot, {
      seat: HERO,
      playerId: "hero",
      status: "drafting",
      draft: { plays: [playOf(board), playOf(second)] },
    });
    assert.ok(
      !used.seats[HERO]?.privateTiles.some((tile) => tile.id === first.id),
      "the discarded tile is gone",
    );
  });

  it("lets an all-in seat use its power in §19's window", () => {
    const state = heroOnTurn("random_wild");
    const shoved = reduce(state, { type: "allIn", playerId: "hero" }, NOW + 3);
    const window = playToWindow(shoved, NOW + 4);

    assert.equal(window.seats[HERO]?.allIn, true);
    assert.equal(window.wordWindow?.status, "open");
    const used = use(window, heroTile(window).id, "random_wild", window.endsAtMs - 1);
    assert.equal(used.powers?.held.hero?.used, true);
  });

  it("scores the new tile at its §6 value in a word at showdown, and marks it as swapped", () => {
    const tile = swapTile("random_wild", { dealSeed: SEED, seat: HERO });
    const board = dealHand().community.find(
      (candidate) => !("alternativeLetter" in candidate) && candidate.multiplier === undefined,
    );
    assert.ok(board, "the board has a plain tile");
    const word = `${tile.letter}${board.letter}`;

    const window = playToWindow(holding("random_wild", { dictionary: testDictionary([word]) }), NOW + 2);
    const used = use(window, heroTile(window).id, "random_wild", window.endsAtMs - 10);
    const confirmed = reduce(
      used,
      { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: tile.id }, { tileId: board.id }] } },
      window.endsAtMs - 5,
    );
    const paid = payOut(confirmed);

    const standing = paid.result?.standings.find((candidate) => candidate.playerId === "hero");
    assert.equal(standing?.word, word);
    assert.equal(standing?.score, tile.points + board.points);
    assert.equal(standing?.place, 1, "the only word at the table");
    assert.equal(paid.powers?.held.hero?.swap?.tile.id, tile.id, "the ⚡ reads the swapped tile's id");
  });
});
