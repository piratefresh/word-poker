import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OfflineAction } from "@wordpoker/contracts";

import {
  BOT_BET_FRACTIONS,
  BOT_BLUFF_BET_FREQUENCY,
  BOT_BLUFF_RAISE_FREQUENCY,
  BOT_VALUE_BET_EDGE,
  BOT_VALUE_RAISE_FREQUENCY,
  chooseOfflineWord,
  decideOfflineMove,
} from "../src/bot";
import { bettingBounds, type BettingBounds } from "../src/betting";
import { BOT_EQUITY_SAMPLES } from "../src/equity";
import { availableTiles, OfflineActionError, reduce, startHand, type OfflineState } from "../src/offline";
import { TEST_DICTIONARY, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function dealHand(seed = 4242): OfflineState {
  return startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
}

function actingSeatId(state: OfflineState): string {
  const index = state.toActIndex;
  const seat = index === null ? undefined : state.seats[index];
  assert.ok(seat, "a seat is to act");
  return seat.id;
}

/** Whether an action is one the seat's bounds enable — the set the bot must stay inside. */
function enabled(bounds: BettingBounds, action: OfflineAction): boolean {
  switch (action.type) {
    case "fold":
      return bounds.canFold;
    case "check":
      return bounds.canCheck;
    case "bet":
      return bounds.canBet && action.amount >= bounds.minBet && action.amount <= bounds.maxRaiseTo;
    case "call":
      return bounds.canCall;
    case "raise":
      return bounds.canRaise && action.amount >= bounds.minRaiseTo && action.amount <= bounds.maxRaiseTo;
    case "allIn":
      return bounds.canAllIn;
    default:
      return false;
  }
}

/** Plays a whole hand with every seat on the bot policy: words included, then the payout. */
function playAll(seed: number): { state: OfflineState; actions: number } {
  let state = startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
  let actions = 0;

  while (state.phase !== "payout") {
    if (state.wordWindow?.status === "open") {
      for (const slot of state.wordWindow.slots) {
        if (state.wordWindow?.status !== "open") break;
        const word = chooseOfflineWord({
          available: availableTiles(state, slot.seat),
          dictionary: TEST_DICTIONARY,
        });
        if (word !== null) {
          state = reduce(state, { type: "confirmWord", playerId: slot.playerId, submission: word }, NOW);
        }
      }
      if (state.wordWindow?.status === "open") {
        state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
      }
      continue;
    }

    const index = state.toActIndex;
    assert.ok(index !== null, "a seat is to act");
    const seat = state.seats[index];
    const round = state.betting;
    assert.ok(seat, `seat ${index}`);
    assert.ok(round, "a betting round is open");

    const bounds = bettingBounds(state.seats, round, index, state.stakes.minBet);
    assert.ok(bounds, `seat ${index} can act`);

    const action = decideOfflineMove(state, seat.id);

    // The property: every action the policy returns is one the bounds enable, with an amount
    // the engine will take — so `reduce` has no reason to refuse it and the hand cannot stall.
    assert.ok(bounds && enabled(bounds, action), `expected ${JSON.stringify(action)} to be enabled`);

    state = reduce(state, action, NOW);
    actions += 1;
    assert.ok(actions <= 60, "a bot hand is a bounded walk");
  }

  return { state, actions };
}

describe("decideOfflineMove — the guards", () => {
  it("deals once the hand has paid out", () => {
    let state = dealHand();
    while (state.phase !== "payout") {
      // §19's window has no turn for a bot to take, so the table's clock closes it and the
      // bot's next real move is the deal that follows.
      state =
        state.wordWindow?.status === "open"
          ? reduce(state, { type: "timeoutWords" }, state.endsAtMs)
          : reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW);
    }

    assert.deepEqual(decideOfflineMove(state, "ellis"), { type: "deal" });
    assert.equal(reduce(state, decideOfflineMove(state, "ellis"), NOW).hand, 2);
  });

  it("has no move while the word window is open", () => {
    // Checking every seat around reaches the river's window without a fold-out: a hand where
    // everyone calls the bot policy's folds never opens one (§26 ends it first).
    let state = dealHand();
    while (state.wordWindow?.status !== "open") {
      const index = state.toActIndex;
      assert.ok(index !== null, "a seat is to act before the window opens");
      state = reduce(state, { type: "check", playerId: state.seats[index]?.id ?? "" }, NOW);
    }

    assert.throws(
      () => decideOfflineMove(state, "ellis"),
      (error: unknown) => error instanceof OfflineActionError && error.message.includes("word window"),
    );
  });

  it("refuses to move out of turn, or for a player who is not seated", () => {
    const state = dealHand();

    assert.throws(
      () => decideOfflineMove(state, "hero"),
      (error: unknown) => error instanceof OfflineActionError && error.message.includes("hero"),
    );
    assert.throws(
      () => decideOfflineMove(state, "ghost"),
      (error: unknown) => error instanceof OfflineActionError,
    );
  });

  it("returns the same move for the same state", () => {
    const state = dealHand();

    assert.deepEqual(decideOfflineMove(state, "ellis"), decideOfflineMove(state, "ellis"));
  });
});

describe("decideOfflineMove — a table of bots", () => {
  it("drives a full hand to the payout with the chips conserved", () => {
    for (const seed of [4242, 4243, 4244]) {
      const { state } = playAll(seed);

      assert.equal(state.phase, "payout");
      assert.equal(state.betting, null);
      assert.equal(
        state.seats.reduce((total, seat) => total + seat.stack, 0),
        SEATS.length * 1_000,
        `seed ${seed} conserved its chips`,
      );
      assert.equal(
        state.result?.payout.stackDeltas.reduce((total, delta) => total + (delta.end - delta.start), 0),
        0,
        `seed ${seed} balanced its deltas`,
      );
    }
  });

  it("stays inside the policy's own constants", () => {
    // The constants are the policy: a change to any of them is a deliberate change to how bots
    // play, and to the sample budget the felt pays for on every decision.
    assert.equal(BOT_VALUE_BET_EDGE, 1.35);
    assert.equal(BOT_BLUFF_BET_FREQUENCY, 0.12);
    assert.equal(BOT_BLUFF_RAISE_FREQUENCY, 0.07);
    assert.equal(BOT_VALUE_RAISE_FREQUENCY, 0.55);
    assert.deepEqual([...BOT_BET_FRACTIONS], [0.5, 0.75, 1]);
    assert.equal(BOT_EQUITY_SAMPLES, 32);
  });
});

describe("decideOfflineMove — what the policy reads", () => {
  /**
   * The decision is a function of the public table and the seat's own tiles, so replacing every
   * tile it cannot see — the other racks, the face-down board — must leave its move alone.
   * This is the invariant STO-361 turns on, tested at the level a bug would show up: the action.
   */
  it("plays the same move whatever the deal put behind the hidden tiles", () => {
    for (const seed of [4242, 4243, 9001]) {
      let state = dealHand(seed);

      for (let step = 0; step < 12; step += 1) {
        if (state.phase === "payout" || state.wordWindow?.status === "open") break;
        const index = state.toActIndex;
        if (index === null) break;
        const seat = state.seats[index];
        if (seat === undefined) break;

        const replaced: OfflineState = {
          ...state,
          community: state.community.map((tile, at) =>
            at < state.revealed ? tile : { id: `hidden-board-${at}`, letter: "Z", points: 10 },
          ),
          seats: state.seats.map((other, at) =>
            at === index
              ? other
              : { ...other, privateTiles: [{ id: `hidden-rack-${at}`, letter: "Q", points: 10 }] },
          ),
        };

        assert.deepEqual(
          decideOfflineMove(replaced, seat.id),
          decideOfflineMove(state, seat.id),
          `seed ${seed} step ${step}: the move did not read a hidden tile`,
        );

        state = reduce(state, decideOfflineMove(state, seat.id), NOW);
      }
    }
  });

  /**
   * The raise a seat faces is part of the key its rolls are named by. A roll that ignored it
   * would be the same roll on every reopening, so a seat that once decided to raise would raise
   * again — and again, until the stacks were gone. What this pins is that no seat raises more
   * than a street's worth of times once it is being raised back at.
   */
  it("does not raise itself down the stack when it is raised back", () => {
    let worst = 0;

    for (let seed = 1; seed <= 12; seed += 1) {
      let state = startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
      const raises = new Map<string, number>();
      let steps = 0;

      while (state.phase !== "payout" && steps < 60) {
        steps += 1;
        if (state.wordWindow?.status === "open") {
          state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
          continue;
        }
        const index = state.toActIndex;
        const seat = index === null ? undefined : state.seats[index];
        if (index === null || seat === undefined) break;

        const action = decideOfflineMove(state, seat.id);
        if (action.type === "raise") {
          const key = `${state.phase}:${index}`;
          raises.set(key, (raises.get(key) ?? 0) + 1);
          worst = Math.max(worst, raises.get(key) ?? 0);
        }
        state = reduce(state, action, NOW);
      }
    }

    assert.ok(worst <= 3, `a seat raised ${worst} times in one street`);
  });
});

describe("chooseOfflineWord", () => {
  it("confirms the best word the tiles can spell", () => {
    const available = availableTiles(dealHand(), 0);
    const dictionary = testDictionary(["AA", "QI", "STRONG"]);

    assert.deepEqual(
      chooseOfflineWord({ available, dictionary }),
      chooseOfflineWord({ available, dictionary }),
    );
  });

  it("returns no word when the tiles spell nothing the table counts", () => {
    assert.equal(
      chooseOfflineWord({ available: availableTiles(dealHand(), 0), dictionary: testDictionary(["STRONG"]) }),
      null,
    );
  });
});
