import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BettingAction, BettingRejectionReason } from "@wordpoker/contracts";

import {
  applyBettingAction,
  bettingBounds,
  nextActor,
  type BettingRoundState,
  type BettingSeatState,
  type BettingStepStatus,
} from "../src/betting";

const MIN_BET = 20;
const START = 1_000;

/** One seat as the machine reads it: all chips in the stack, nothing committed yet. */
function seat(id: string, stack = START, overrides: Partial<BettingSeatState> = {}): BettingSeatState {
  return {
    id,
    stack,
    committedRound: 0,
    committedHand: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    actedThisRound: false,
    ...overrides,
  };
}

interface Table {
  seats: readonly BettingSeatState[];
  round: BettingRoundState;
  toAct: number | null;
  status: BettingStepStatus;
}

/** A round opened on the seats handed in: nobody committed, the seat at `toAct` on the clock. */
function open(seats: readonly BettingSeatState[], toAct = 0): Table {
  return { seats, round: { currentBet: 0, lastRaiseSize: 0 }, toAct, status: "open" };
}

/** A round already carrying a bet — the state a seat faces when it is not opening. */
function facing(seats: readonly BettingSeatState[], round: BettingRoundState, toAct = 0): Table {
  return { seats, round, toAct, status: "open" };
}

function acting(table: Table): number {
  assert.ok(table.toAct !== null, "a seat is to act");
  return table.toAct;
}

/** Applies an action the test expects to be accepted and returns the table it left behind. */
function play(table: Table, action: BettingAction): Table {
  const applied = applyBettingAction(table.seats, table.round, acting(table), action, MIN_BET);

  assert.ok(applied.ok, `expected ${JSON.stringify(action)} to be accepted`);
  return { seats: applied.step.seats, round: applied.step.round, toAct: applied.step.toAct, status: applied.step.status };
}

/** Applies an action the test expects to be refused, and proves nothing changed. */
function refuse(table: Table, action: BettingAction, toAct = acting(table)): BettingRejectionReason {
  const before = structuredClone(table);
  const applied = applyBettingAction(table.seats, table.round, toAct, action, MIN_BET);

  assert.ok(!applied.ok, `expected ${JSON.stringify(action)} to be refused`);
  assert.deepEqual(table, before, "a refusal must not touch the table");

  return applied.reason;
}

const bet = (playerId: string, amount: number): BettingAction => ({ type: "bet", playerId, amount });
const raise = (playerId: string, amount: number): BettingAction => ({ type: "raise", playerId, amount });
const call = (playerId: string): BettingAction => ({ type: "call", playerId });
const check = (playerId: string): BettingAction => ({ type: "check", playerId });
const fold = (playerId: string): BettingAction => ({ type: "fold", playerId });
const allIn = (playerId: string): BettingAction => ({ type: "allIn", playerId });

describe("applyBettingAction — guards", () => {
  it("refuses an action from a seat that is not to act, or for a seat that is not seated", () => {
    const table = open([seat("hero"), seat("ellis")]);

    assert.equal(refuse(table, check("ellis")), "not-your-turn");
    assert.equal(refuse(table, check("ghost")), "not-your-turn");
    assert.equal(refuse(table, check("hero"), 7), "not-your-turn");
  });

  it("refuses a seat that has already folded", () => {
    const table = open([seat("hero", START, { folded: true }), seat("ellis")]);

    assert.equal(refuse(table, check("hero")), "already-folded");
  });

  it("refuses a seat that is already all in", () => {
    const table = open([seat("hero", 0, { allIn: true }), seat("ellis")]);

    assert.equal(refuse(table, check("hero")), "already-all-in");
  });

  it("refuses a seat that is sitting the hand out", () => {
    const table = open([seat("hero", 0, { sittingOut: true }), seat("ellis")]);

    assert.equal(refuse(table, check("hero")), "not-in-hand");
  });

  it("never mutates the seats or the round it was handed", () => {
    const seats = [seat("hero"), seat("ellis")];
    const round: BettingRoundState = { currentBet: 0, lastRaiseSize: 0 };
    const before = structuredClone(seats);

    applyBettingAction(seats, round, 0, bet("hero", 20), MIN_BET);

    assert.deepEqual(seats, before);
    assert.deepEqual(round, { currentBet: 0, lastRaiseSize: 0 });
  });
});

describe("applyBettingAction — legality", () => {
  it("refuses a check while facing a bet", () => {
    const table = facing([seat("hero"), seat("ellis", START, { committedRound: 40 })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    assert.equal(refuse(table, check("hero"), 0), "check-facing-bet");
  });

  it("refuses a call when there is nothing to call", () => {
    const table = open([seat("hero"), seat("ellis")]);

    assert.equal(refuse(table, call("hero")), "no-bet-to-call");
  });

  it("refuses a raise when no bet has been made — the opening move is a bet", () => {
    const table = open([seat("hero"), seat("ellis")]);

    assert.equal(refuse(table, raise("hero", 40)), "no-bet-to-call");
  });

  it("refuses a bet once the round has a current bet — that is a raise", () => {
    const table = facing([seat("hero"), seat("ellis", START, { committedRound: 40 })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    assert.equal(refuse(table, bet("hero", 60)), "bet-facing-bet");
  });

  it("refuses a bet below the table's minimum", () => {
    const table = open([seat("hero"), seat("ellis")]);

    assert.equal(refuse(table, bet("hero", 19)), "below-min-bet");
  });

  it("refuses a bet larger than the stack", () => {
    const table = open([seat("hero", 30), seat("ellis")]);

    assert.equal(refuse(table, bet("hero", 40)), "insufficient-stack");
  });

  it("refuses a raise below the floor", () => {
    const table = facing([seat("hero"), seat("ellis", START, { committedRound: 40 })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    // The floor is 40 + max(40, 20) = 80; a raise to 60 leaves the last increment short.
    assert.equal(refuse(table, raise("hero", 60), 0), "below-min-raise");
  });

  it("refuses a raise the stack cannot cover", () => {
    const table = facing([seat("hero", 100), seat("ellis", START, { committedRound: 40 })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    assert.equal(refuse(table, raise("hero", 300), 0), "insufficient-stack");
  });

  it("refuses a second raise from a seat that has acted and been answered only by a call", () => {
    const table: Table = {
      seats: [
        seat("hero", 980, { committedRound: 20, committedHand: 20, actedThisRound: true }),
        seat("ellis", 960, { committedRound: 40, committedHand: 40, actedThisRound: true }),
      ],
      round: { currentBet: 40, lastRaiseSize: 20 },
      toAct: 0,
      status: "open",
    };

    // Raising is closed to hero until a full raise reopens it — but calling the difference
    // is not, so the seat is only ever stuck, never skipped.
    assert.equal(refuse(table, raise("hero", 60)), "action-closed");
    assert.equal(play(table, call("hero")).status, "round-complete");
  });
});

describe("applyBettingAction — the round walks", () => {
  it("closes when every seat has checked around", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay")]);

    table = play(table, check("hero"));
    assert.equal(table.status, "open");
    assert.equal(table.toAct, 1);

    table = play(table, check("ellis"));
    assert.equal(table.status, "open");
    assert.equal(table.toAct, 2);

    table = play(table, check("jay"));
    assert.equal(table.status, "round-complete");
    assert.equal(table.toAct, null);
  });

  it("closes after a bet and a call, heads up", () => {
    let table = open([seat("hero"), seat("ellis")]);

    table = play(table, bet("hero", 20));
    assert.equal(table.round.currentBet, 20);
    assert.equal(table.round.lastRaiseSize, 20);
    assert.equal(table.toAct, 1);

    table = play(table, call("ellis"));
    assert.equal(table.status, "round-complete");
    assert.equal(table.seats[1]?.committedRound, 20);
  });

  it("closes after a bet, a raise and a call", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay")]);

    table = play(table, bet("hero", 20));
    table = play(table, raise("ellis", 40));
    assert.equal(table.round.currentBet, 40);
    assert.equal(table.round.lastRaiseSize, 20);
    // The full raise reopened the action to hero, who bet before it.
    assert.equal(table.seats[0]?.actedThisRound, false);

    table = play(table, call("jay"));
    assert.equal(table.toAct, 0);

    table = play(table, call("hero"));
    assert.equal(table.status, "round-complete");
  });

  it("walks a re-raise chain to its close", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay")]);

    table = play(table, bet("hero", 20));
    table = play(table, raise("ellis", 40));
    table = play(table, raise("jay", 60));
    assert.equal(table.round.currentBet, 60);
    assert.equal(table.round.lastRaiseSize, 20);

    table = play(table, call("hero"));
    table = play(table, call("ellis"));
    assert.equal(table.status, "round-complete");
    assert.deepEqual(
      table.seats.map((s) => s.committedRound),
      [60, 60, 60],
    );
  });

  it("opens the next actor clockwise, skipping folded and all-in seats", () => {
    const seats = [
      seat("hero", 980, { committedRound: 20, committedHand: 20, actedThisRound: true }),
      seat("ellis", 0, { allIn: true, committedHand: 1_000, committedRound: 980 }),
      seat("jay", 960, { committedRound: 40, committedHand: 40, actedThisRound: true }),
      seat("mira", START, { folded: true }),
    ];

    // From jay, the walk skips the folded mira, passes ellis's all-in, and wraps to hero.
    assert.equal(nextActor(seats, 40, 2), 0);
    // At 20 every live seat has matched and acted, so the round is settled.
    assert.equal(nextActor(seats, 20, 0), null);
  });
});

describe("applyBettingAction — all-in and short calls", () => {
  it("lets a short stack call all in for what it has (§23)", () => {
    const table = facing([seat("hero", 25), seat("ellis", START, { committedRound: 40, actedThisRound: true })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    const after = play(table, call("hero"));

    assert.equal(after.seats[0]?.committedRound, 25);
    assert.equal(after.seats[0]?.committedHand, 25);
    assert.equal(after.seats[0]?.stack, 0);
    assert.equal(after.seats[0]?.allIn, true);
    // The short call is not a raise: the current bet is untouched.
    assert.equal(after.round.currentBet, 40);
  });

  it("commits the exact remaining stack on an all-in, and reopens when it is a full raise", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay")]);

    table = play(table, bet("hero", 20));
    const afterShove = play(table, allIn("ellis"));

    // ellis held the full 1,000: the shove is the round total, and 1,000 ≥ 20 + max(20, 20).
    assert.equal(afterShove.round.currentBet, 1_000);
    assert.equal(afterShove.round.lastRaiseSize, 980);
    assert.equal(afterShove.seats[1]?.stack, 0);
    assert.equal(afterShove.seats[1]?.allIn, true);
    // A full raise reopens the action to every other live seat, hero included.
    assert.equal(afterShove.seats[0]?.actedThisRound, false);
    assert.equal(afterShove.seats[2]?.actedThisRound, false);
  });

  it("lets an all-in short of a full raise move the current bet without reopening it (§31)", () => {
    let table = open([seat("hero"), seat("ellis", 30)]);

    table = play(table, bet("hero", 20));
    const afterShove = play(table, allIn("ellis"));

    // 30 is short of the 40 floor, so the current bet moves but nothing reopens.
    assert.equal(afterShove.round.currentBet, 30);
    assert.equal(afterShove.round.lastRaiseSize, 20);
    assert.equal(afterShove.seats[0]?.actedThisRound, true);
    assert.equal(afterShove.seats[0]?.committedRound, 20);
    assert.equal(afterShove.toAct, 0);

    // hero owes the extra 10 and may call or fold — but not raise.
    assert.equal(refuse(afterShove, raise("hero", 60), 0), "action-closed");
    assert.equal(play(afterShove, call("hero")).seats[0]?.committedRound, 30);
  });

  it("accepts a raise whose amount is exactly the seat's whole stack, even below the floor", () => {
    const table = facing([seat("hero", 50), seat("ellis", START, { committedRound: 40 })], {
      currentBet: 40,
      lastRaiseSize: 40,
    });

    const after = play(table, raise("hero", 50));

    assert.equal(after.seats[0]?.stack, 0);
    assert.equal(after.seats[0]?.allIn, true);
    assert.equal(after.round.currentBet, 50);
    // Short of the 80 floor: the shove moved the current bet but reopened nothing.
    assert.equal(after.round.lastRaiseSize, 40);
  });

  it("closes the hand when only one seat is left un-folded (§26)", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay")]);

    table = play(table, fold("hero"));
    assert.equal(table.status, "open");

    table = play(table, fold("ellis"));
    assert.equal(table.status, "hand-over");
    assert.equal(table.toAct, null);
    assert.equal(table.seats[2]?.folded, false);
  });

  it("closes the round when every seat left to act is all in (§15)", () => {
    let table = open([seat("hero"), seat("ellis"), seat("jay", 2_000)]);

    table = play(table, allIn("hero"));
    table = play(table, allIn("ellis"));
    table = play(table, call("jay"));

    assert.equal(table.status, "round-complete");
    assert.equal(table.seats[0]?.allIn, true);
    assert.equal(table.seats[1]?.allIn, true);
    assert.equal(table.seats[2]?.allIn, false);
    assert.equal(table.seats[2]?.stack, 1_000);
  });
});

describe("bettingBounds", () => {
  it("arms the opening bet and the fold, but not call or raise, when no bet is out", () => {
    const bounds = bettingBounds([seat("hero"), seat("ellis")], { currentBet: 0, lastRaiseSize: 0 }, 0, MIN_BET);

    assert.deepEqual(bounds, {
      canFold: true,
      canCheck: true,
      canBet: true,
      canCall: false,
      canRaise: false,
      canAllIn: true,
      callAmount: 0,
      minRaiseTo: MIN_BET,
      maxRaiseTo: START,
      minBet: MIN_BET,
      currentBet: 0,
    });
  });

  it("bounds a raise by the floor and the stack when facing a bet", () => {
    const seats = [seat("hero", 900, { committedRound: 100 }), seat("ellis", START, { committedRound: 300 })];
    const bounds = bettingBounds(seats, { currentBet: 300, lastRaiseSize: 200 }, 0, MIN_BET);

    assert.ok(bounds !== null);
    assert.equal(bounds.canCheck, false);
    assert.equal(bounds.canCall, true);
    assert.equal(bounds.callAmount, 200);
    assert.equal(bounds.canBet, false);
    assert.equal(bounds.canRaise, true);
    assert.equal(bounds.minRaiseTo, 500);
    assert.equal(bounds.maxRaiseTo, 1_000);
  });

  it("keeps the round's raise closed to a seat that has acted and has not been reopened", () => {
    const seats = [seat("hero", 980, { committedRound: 20, actedThisRound: true }), seat("ellis", START, { committedRound: 40 })];
    const bounds = bettingBounds(seats, { currentBet: 40, lastRaiseSize: 20 }, 0, MIN_BET);

    assert.ok(bounds !== null);
    assert.equal(bounds.canRaise, false);
    assert.equal(bounds.canCall, true);
    assert.equal(bounds.canFold, true);
  });

  it("closes the raise to a stack that cannot reach the floor", () => {
    const seats = [seat("hero", 30), seat("ellis", START, { committedRound: 40 })];
    const bounds = bettingBounds(seats, { currentBet: 40, lastRaiseSize: 40 }, 0, MIN_BET);

    assert.ok(bounds !== null);
    assert.equal(bounds.canRaise, false);
    assert.equal(bounds.maxRaiseTo, 30);
    assert.equal(bounds.minRaiseTo, 80);
  });

  it("refuses a bet the stack cannot pay for", () => {
    const bounds = bettingBounds([seat("hero", 10), seat("ellis")], { currentBet: 0, lastRaiseSize: 0 }, 0, MIN_BET);

    assert.ok(bounds !== null);
    assert.equal(bounds.canBet, false);
    assert.equal(bounds.canAllIn, true);
  });

  it("has no bounds for a seat that cannot act", () => {
    const seats = [
      seat("hero", START, { folded: true }),
      seat("ellis", 0, { allIn: true }),
      seat("jay", 0, { sittingOut: true }),
    ];
    const round = { currentBet: 0, lastRaiseSize: 0 };

    assert.equal(bettingBounds(seats, round, 0, MIN_BET), null);
    assert.equal(bettingBounds(seats, round, 1, MIN_BET), null);
    assert.equal(bettingBounds(seats, round, 2, MIN_BET), null);
    assert.equal(bettingBounds(seats, round, 9, MIN_BET), null);
  });
});
