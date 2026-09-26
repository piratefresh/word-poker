import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BETTING_REJECTION_REASONS,
  GAME_EVENTS,
  GAME_MESSAGES,
  isGameMessagePayload,
  isGameRejectionEvent,
  isOnlineBettingAction,
  isOnlineWordAction,
  type GameTableState,
  type OnlineBettingAction,
} from "../src/index";

describe("online message vocabulary", () => {
  it("keeps client messages separate from server-owned transitions", () => {
    assert.deepEqual(GAME_MESSAGES, {
      betting: "betting",
      draftWord: "draftWord",
      confirmWord: "confirmWord",
      ready: "ready",
    });
    assert.deepEqual(GAME_EVENTS, {
      privateState: "privateState",
      rejected: "rejected",
    });

    const actions: readonly OnlineBettingAction[] = [
      { type: "fold" },
      { type: "check" },
      { type: "bet", amount: 20 },
      { type: "call" },
      { type: "raise", amount: 40 },
      { type: "allIn" },
    ];
  });

  it("validates connection-owned betting and word payloads", () => {
    assert.ok(isOnlineBettingAction({ type: "bet", amount: 20 }));
    assert.ok(!isOnlineBettingAction({ type: "bet", amount: 20, playerId: "forged" }));
    assert.ok(!isOnlineBettingAction({ type: "bet", amount: 20.5 }));

    assert.ok(isOnlineWordAction({ submission: { plays: [] } }));
    assert.ok(!isOnlineWordAction({ submission: { plays: [] }, playerId: "forged" }));
    assert.ok(!isOnlineWordAction({ submission: { plays: [{ tileId: "" }] } }));

    assert.ok(isGameMessagePayload("betting", { type: "check" }));
    assert.ok(isGameMessagePayload("draftWord", { submission: { plays: [] } }));
    assert.ok(!isGameMessagePayload("confirmWord", { plays: [] }));
  });
});

describe("online state and rejection shapes", () => {
  it("carries a server clock with every deadline", () => {
    const snapshot: GameTableState = {
      now: 1_000,
      table: { name: "Test", buyIn: 500, smallBlind: 5, bigBlind: 10, maxSeats: 2 },
      phase: "preflop",
      sessionOver: false,
      handCount: 1,
      dealerSeat: 0,
      toActSeat: 1,
      turnDeadline: 61_000,
      seats: [],
      betting: null,
      pots: [],
      community: [],
      wordWindow: null,
      result: null,
    };

    assert.equal(snapshot.now, 1_000);
    assert.equal(snapshot.turnDeadline, 61_000);
  });

  it("includes the server turn-timeout reason in the shared enum", () => {
    assert.ok(BETTING_REJECTION_REASONS.includes("turn-timeout"));
    assert.ok(isGameRejectionEvent({ action: "betting", reason: "turn-timeout" }));
    assert.ok(isGameRejectionEvent({ action: "draftWord", reason: "too-short" }));
    assert.ok(!isGameRejectionEvent({ action: "draftWord", reason: "turn-timeout" }));
  });
});
