import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROUND_PHASES, type OfflineAction } from "@wordpoker/contracts";

import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "../src/deal";
import {
  BettingRejectionError,
  OFFLINE_TURN_MS,
  OfflineActionError,
  reduce,
  revealedCount,
  startHand,
  WORD_WINDOW_MS,
  type OfflineState,
  type StartHandOptions,
} from "../src/offline";
import { TEST_DICTIONARY, cloneState } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

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
 * Checks every seat through every street, up to §19's window (or a hand that ends early).
 * With no bets, every round is a check-around and every street rolls on the last check, so
 * the walk is the same 16 actions the old turn-pass needed — each one now a real action.
 */
function checkAround(state: OfflineState, fromMs = NOW): OfflineState {
  let next = state;
  let step = 0;

  while (next.wordWindow?.status !== "open" && next.phase !== "payout") {
    const { id } = actingSeat(next);
    next = reduce(next, { type: "check", playerId: id }, fromMs + step);
    step += 1;
    assert.ok(step <= SEATS.length * ROUND_PHASES.length, "a checked hand is a bounded walk");
  }

  return next;
}

/** §19's window closed with the clock run out, which is how a hand reaches its payout. */
function payOut(state: OfflineState): OfflineState {
  return reduce(state, { type: "timeoutWords" }, state.endsAtMs);
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
    assert.deepEqual(state.betting, { currentBet: 0, lastRaiseSize: 0 });
    assert.equal(state.sessionOver, false);
  });

  it("arms the first turn's deadline from the injected clock", () => {
    assert.equal(dealHand({}, NOW).endsAtMs, NOW + OFFLINE_TURN_MS);
  });

  it("starts the action at the first live seat clockwise from the dealer button (§5)", () => {
    assert.equal(dealHand().toActIndex, 1);
    assert.equal(dealHand({ dealerSeat: 2 }).toActIndex, 3);
    assert.equal(dealHand({ dealerSeat: 3 }).toActIndex, 0);
  });

  it("seats each player on the stack it was carried in with", () => {
    const state = dealHand({ stacks: [{ playerId: "hero", stack: 640 }, { playerId: "ellis", stack: 2_500 }] });

    assert.deepEqual(
      state.seats.map((seat) => seat.stack),
      [640, 2_500, 1_000, 1_000],
    );
  });

  it("seats a busted seat out instead of dealing it a hand it cannot pay (ADR 0002)", () => {
    const state = dealHand({ stacks: [{ playerId: "ellis", stack: 0 }] });

    assert.equal(state.seats[1]?.stack, 0);
    assert.equal(state.seats[1]?.sittingOut, true);
    // The button is seat 0, and ellis cannot act, so the action starts at jay.
    assert.equal(state.toActIndex, 2);
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
    const state = dealHand({ stakes: { minBet: 50, startingStack: 500 } });

    assert.equal(state.stakes.minBet, 50);
    assert.equal(state.seats[0]?.stack, 500);
    assert.throws(
      () => reduce(state, { type: "bet", playerId: "ellis", amount: 20 }, NOW),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "below-min-bet",
    );
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
  it("passes the turn clockwise, and rolls the street when the round closes", () => {
    let state = dealHand();

    assert.equal(state.toActIndex, 1);
    state = reduce(state, { type: "check", playerId: "ellis" }, NOW);
    assert.equal(state.toActIndex, 2);
    state = reduce(state, { type: "check", playerId: "jay" }, NOW + 1);
    state = reduce(state, { type: "check", playerId: "mira" }, NOW + 2);
    assert.equal(state.toActIndex, 0);

    state = reduce(state, { type: "check", playerId: "hero" }, NOW + 3);

    assert.equal(state.phase, "flop");
    assert.equal(state.revealed, 3);
    assert.equal(state.toActIndex, 1);
    assert.deepEqual(state.betting, { currentBet: 0, lastRaiseSize: 0 });
  });

  it("re-arms the deadline from the clock the action carried", () => {
    const state = reduce(dealHand(), { type: "check", playerId: "ellis" }, NOW + 5_000);

    assert.equal(state.endsAtMs, NOW + 5_000 + OFFLINE_TURN_MS);
  });

  it("auto-checks an idle seat when its turn expires", () => {
    const state = dealHand();
    const timedOut = reduce(state, { type: "timeoutTurn" }, state.endsAtMs);

    assert.equal(timedOut.seats[1]?.actedThisRound, true);
    assert.equal(timedOut.seats[1]?.folded, false);
    assert.equal(timedOut.toActIndex, 2);
  });

  it("auto-folds an idle seat that owes chips when its turn expires", () => {
    let state = dealHand();
    state = reduce(state, { type: "bet", playerId: "ellis", amount: 20 }, NOW);
    const timedOut = reduce(state, { type: "timeoutTurn" }, state.endsAtMs);

    assert.equal(timedOut.seats[2]?.folded, true);
    assert.equal(timedOut.seats[2]?.committedHand, 0);
    assert.equal(timedOut.toActIndex, 3);
  });

  it("refuses a timeout before the deadline and refuses late voluntary action", () => {
    const state = dealHand();
    assert.throws(
      () => reduce(state, { type: "timeoutTurn" }, state.endsAtMs - 1),
      OfflineActionError,
    );
    assert.throws(
      () => reduce(state, { type: "check", playerId: "ellis" }, state.endsAtMs),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "turn-timeout",
    );
  });

  it("server-folds the acting seat at the deadline, and the fold-out pays (§29)", () => {
    const state = dealHand({ players: ["hero", "ellis"] });
    const { index, id } = actingSeat(state);

    const folded = reduce(state, { type: "foldTurn" }, state.endsAtMs);

    assert.equal(folded.seats[index]?.id, id);
    assert.equal(folded.seats[index]?.folded, true);
    assert.equal(folded.phase, "payout", "the last seat standing takes the pot (§26)");
    assert.equal(folded.result?.winner, "hero");
  });

  it("server-folds the acting seat before the deadline too — the onLeave path (§29)", () => {
    const state = dealHand();
    const { index } = actingSeat(state);

    const folded = reduce(state, { type: "foldTurn" }, state.endsAtMs - 1);

    assert.equal(folded.seats[index]?.folded, true);
    assert.equal(folded.phase, "preflop", "the hand goes on with the seats that remain");
    assert.equal(folded.toActIndex, index + 1);
  });

  it("refuses a server fold when no betting round is open", () => {
    const state = checkAround(dealHand());
    assert.equal(state.wordWindow?.status, "open");

    assert.throws(() => reduce(state, { type: "foldTurn" }, state.endsAtMs), OfflineActionError);
  });

  it("carries a configured turn duration into the next hand", () => {
    let state = dealHand({ turnDurationMs: 5_000 });
    assert.equal(state.endsAtMs, NOW + 5_000);
    state = checkAround(state);
    state = payOut(state);
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

  it("refuses a check while facing a bet", () => {
    let state = dealHand();
    state = reduce(state, { type: "bet", playerId: "ellis", amount: 20 }, NOW);

    assert.throws(
      () => reduce(state, { type: "check", playerId: "jay" }, NOW + 1),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "check-facing-bet",
    );
  });

  it("tracks the chips: a bet and three calls move the pot and leave the round settled", () => {
    let state = dealHand();
    state = reduce(state, { type: "bet", playerId: "ellis", amount: 20 }, NOW);
    assert.equal(state.betting?.currentBet, 20);
    assert.equal(state.seats[1]?.stack, 980);
    assert.equal(state.seats[1]?.committedRound, 20);

    state = reduce(state, { type: "call", playerId: "jay" }, NOW + 1);
    state = reduce(state, { type: "call", playerId: "mira" }, NOW + 2);
    state = reduce(state, { type: "call", playerId: "hero" }, NOW + 3);

    // Every seat matched the bet, so the round closed and the street rolled: the hand keeps
    // what was committed, the round starts over.
    assert.equal(state.phase, "flop");
    assert.equal(state.betting?.currentBet, 0);
    assert.deepEqual(
      state.seats.map((seat) => seat.committedHand),
      [20, 20, 20, 20],
    );
    assert.deepEqual(
      state.seats.map((seat) => seat.committedRound),
      [0, 0, 0, 0],
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
        // Every seat checks once on the street, and the round's last check rolls it.
        for (let seat = 0; seat < SEATS.length; seat += 1) {
          state = reduce(state, { type: "check", playerId: actingSeat(state).id }, NOW + seat);
        }
      }
    }
  });

  it("has nobody to act once the hand has paid out", () => {
    const payout = payOut(checkAround(dealHand()));

    assert.equal(payout.phase, "payout");
    assert.equal(payout.toActIndex, null);
    assert.equal(payout.betting, null);
    assert.equal(payout.revealed, 5);
  });

  it("keeps the whole board down until the flop", () => {
    const preflop = dealHand();
    const flop = reduce(preflop, { type: "check", playerId: "ellis" }, NOW);
    const rolled = reduce(
      reduce(reduce(flop, { type: "check", playerId: "jay" }, NOW + 1), { type: "check", playerId: "mira" }, NOW + 2),
      { type: "check", playerId: "hero" },
      NOW + 3,
    );

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
    const at = (state: OfflineState, action: OfflineAction, step: number): OfflineState =>
      reduce(state, action, NOW + step);

    let state = dealHand();
    state = at(state, { type: "bet", playerId: "ellis", amount: 100 }, 1);
    state = at(state, { type: "fold", playerId: "jay" }, 2);
    state = at(state, { type: "fold", playerId: "mira" }, 3);
    state = at(state, { type: "fold", playerId: "hero" }, 4);

    assert.equal(state.phase, "payout");
    assert.equal(state.wordWindow, null);
    assert.equal(state.betting, null);
    assert.equal(state.toActIndex, null);
    assert.equal(state.endsAtMs, NOW + 4);
    assert.deepEqual(state.result?.standings, []);
    assert.deepEqual(state.result?.comparisons, []);
    assert.equal(state.result?.winner, "ellis");

    const pot = state.result?.payout.pots[0];
    assert.equal(pot?.amount, 100);
    assert.deepEqual(pot?.winners, ["ellis"]);
    assert.equal(pot?.ranking, null);
    assert.equal(state.seats[1]?.stack, 1_000);
    assert.deepEqual(state.result?.payout.stackDeltas, [
      { playerId: "hero", start: 1_000, end: 1_000 },
      { playerId: "ellis", start: 1_000, end: 1_000 },
      { playerId: "jay", start: 1_000, end: 1_000 },
      { playerId: "mira", start: 1_000, end: 1_000 },
    ]);
  });

  it("runs an all-in preflop through the streets to §19's window in one transition", () => {
    const at = (state: OfflineState, action: OfflineAction, step: number): OfflineState =>
      reduce(state, action, NOW + step);

    let state = dealHand();
    state = at(state, { type: "allIn", playerId: "ellis" }, 1);
    state = at(state, { type: "call", playerId: "jay" }, 2);
    state = at(state, { type: "fold", playerId: "mira" }, 3);
    state = at(state, { type: "fold", playerId: "hero" }, 4);

    assert.equal(state.phase, "river");
    assert.equal(state.revealed, 5);
    assert.equal(state.betting, null);
    assert.equal(state.endsAtMs, NOW + 4 + WORD_WINDOW_MS);
    assert.equal(state.wordWindow?.status, "open");
    // Only the seats still in the hand build a word; the folded seats are simply not there.
    assert.deepEqual(
      (state.wordWindow?.slots ?? []).map((slot) => slot.playerId),
      ["ellis", "jay"],
    );

    const paid = payOut(state);
    const stacks = paid.seats.map((seat) => seat.stack);
    assert.deepEqual([...stacks].sort((a, b) => a - b), [0, 1_000, 1_000, 2_000]);
    assert.equal(paid.result?.payout.pots[0]?.amount, 2_000);
  });

  it("keeps a folded seat out of the window even when the hand plays on", () => {
    const at = (state: OfflineState, action: OfflineAction, step: number): OfflineState =>
      reduce(state, action, NOW + step);

    let state = dealHand();
    state = at(state, { type: "bet", playerId: "ellis", amount: 20 }, 1);
    state = at(state, { type: "fold", playerId: "jay" }, 2);
    state = at(state, { type: "call", playerId: "mira" }, 3);
    state = at(state, { type: "call", playerId: "hero" }, 4);

    const window = checkAround(state, NOW + 5);

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
    let state = dealHand();
    for (const playerId of ["ellis", "jay", "mira", "hero"] as const) {
      state = reduce(state, { type: playerId === "ellis" ? "allIn" : "call", playerId }, NOW);
    }
    return payOut(state);
  }

  it("deals a fresh hand from the last one's seed, carrying stacks and stepping the button", () => {
    const payout = payOut(checkAround(dealHand()));
    const next = reduce(payout, { type: "deal" }, NOW);

    assert.equal(next.hand, 2);
    assert.equal(next.seed, payout.seed + payout.hand);
    assert.equal(next.phase, "preflop");
    assert.equal(next.revealed, 0);
    assert.equal(next.dealerSeat, 1);
    assert.equal(next.toActIndex, 2);
    assert.equal(next.endsAtMs, NOW + OFFLINE_TURN_MS);
    assert.deepEqual(
      next.seats.map((seat) => seat.stack),
      [1_000, 1_000, 1_000, 1_000],
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
    const payout = payOut(checkAround(dealHand()));
    const once = reduce(payout, { type: "deal" }, NOW);
    const twice = reduce(payOut(checkAround(dealHand())), { type: "deal" }, NOW);

    assert.deepEqual(once, twice);
  });

  it("plays the same chips for the same seed and the same action script", () => {
    const script: readonly OfflineAction[] = [
      { type: "bet", playerId: "ellis", amount: 20 },
      { type: "call", playerId: "jay" },
      { type: "fold", playerId: "mira" },
      { type: "call", playerId: "hero" },
    ];

    const play = (): OfflineState => {
      let state = dealHand();
      script.forEach((action, step) => {
        state = reduce(state, action, NOW + step);
      });
      return reduce(payOut(checkAround(state, NOW + script.length)), { type: "deal" }, NOW);
    };

    const first = play();
    const again = play();

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
        state = reduce(state, { type: "check", playerId: actingSeat(state).id }, NOW + step);
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
    const window = checkAround(dealHand());

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

    reduce(state, { type: "check", playerId: "ellis" }, NOW + 1);
    assert.throws(() => reduce(state, { type: "check", playerId: "hero" }, NOW + 1));

    assert.deepEqual(state, before);
  });
});
