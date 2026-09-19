import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideOfflineMove } from "../src/bot";
import { OfflineActionError, reduce, startHand, type OfflineState } from "../src/offline";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function dealHand(): OfflineState {
  return startHand({ seed: 4242, players: SEATS, nowMs: NOW });
}

function actingSeatId(state: OfflineState): string {
  const index = state.toActIndex;
  const seat = index === null ? undefined : state.seats[index];
  assert.ok(seat, "a seat is to act");
  return seat.id;
}

describe("decideOfflineMove", () => {
  it("returns the same move for the same state", () => {
    const state = reduce(dealHand(), { type: "advance" }, NOW);
    const bot = actingSeatId(state);

    assert.deepEqual(decideOfflineMove(state, bot), decideOfflineMove(state, bot));
  });

  it("passes its turn when it is the bot's turn", () => {
    const state = reduce(dealHand(), { type: "advance" }, NOW);

    assert.equal(state.toActIndex, 1);
    assert.deepEqual(decideOfflineMove(state, "ellis"), { type: "advance" });
  });

  it("refuses to move out of turn, or for a player who is not seated", () => {
    const state = dealHand();

    assert.throws(
      () => decideOfflineMove(state, "ellis"),
      (error: unknown) =>
        error instanceof OfflineActionError && error.message.includes("ellis"),
    );
    assert.throws(
      () => decideOfflineMove(state, "ghost"),
      (error: unknown) => error instanceof OfflineActionError,
    );
  });

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
    let state = dealHand();
    while (state.wordWindow?.status !== "open") {
      state = reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW);
    }

    assert.throws(
      () => decideOfflineMove(state, "ellis"),
      (error: unknown) => error instanceof OfflineActionError && error.message.includes("word window"),
    );
  });

  it("only ever asks for a legal transition", () => {
    let state = dealHand();
    let moves = 0;

    while (state.phase !== "payout") {
      if (state.wordWindow?.status === "open") {
        state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
        continue;
      }

      state = reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW + moves);
      moves += 1;
      assert.ok(moves <= SEATS.length * 4, "a hand is at most four streets of turns");
    }

    assert.equal(state.phase, "payout");
    assert.ok(moves > 0);
  });
});
