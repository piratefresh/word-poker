import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BETTING_REJECTION_REASONS,
  GAME_EVENTS,
  GAME_MESSAGES,
  POWER_ACTION_ID_MAX_LENGTH,
  POWER_UP_IDS,
  isGameMessagePayload,
  isGameRejectionEvent,
  isOnlineBettingAction,
  isOnlinePickPowerAction,
  isOnlineUsePowerUpAction,
  isOnlineWordAction,
  type GameTableState,
  type OnlineBettingAction,
} from "../src/index";

describe("online message vocabulary", () => {
  it("keeps client messages separate from server-owned transitions", () => {
    assert.deepEqual(GAME_MESSAGES, {
      befriend: "befriend",
      betting: "betting",
      checkWord: "checkWord",
      draftWord: "draftWord",
      confirmWord: "confirmWord",
      ready: "ready",
      resultsSeen: "resultsSeen",
      pickPower: "pickPower",
      usePowerUp: "usePowerUp",
    });
    assert.deepEqual(GAME_EVENTS, {
      befriendResult: "befriendResult",
      privateState: "privateState",
      rejected: "rejected",
      powerDraw: "powerDraw",
      powerSwap: "powerSwap",
      powerUsed: "powerUsed",
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

    assert.ok(isGameMessagePayload("resultsSeen", undefined));
    assert.ok(!isGameMessagePayload("resultsSeen", { playerId: "forged" }));
    assert.ok(isGameMessagePayload("betting", { type: "check" }));
    assert.ok(isGameMessagePayload("draftWord", { submission: { plays: [] } }));
    assert.ok(!isGameMessagePayload("confirmWord", { plays: [] }));
  });
});

describe("power commands", () => {
  const pick = { actionId: "a1", handId: 3, powerUpId: "vowel_magnet" };
  const use = { ...pick, tileId: "t-7" };

  it("validates a pick and a use for every power in the catalog", () => {
    for (const powerUpId of POWER_UP_IDS) {
      assert.ok(isOnlinePickPowerAction({ ...pick, powerUpId }), powerUpId);
      assert.ok(isOnlineUsePowerUpAction({ ...use, powerUpId }), powerUpId);
    }
    assert.ok(isGameMessagePayload("pickPower", pick));
    assert.ok(isGameMessagePayload("usePowerUp", use));
  });

  it("refuses a command that forges a seat, names no power, or misses its hand", () => {
    for (const value of [
      null,
      { ...pick, playerId: "forged" },
      { ...pick, powerUpId: "double_down" },
      { ...pick, powerUpId: undefined },
      { ...pick, actionId: "" },
      { ...pick, actionId: 7 },
      { ...pick, actionId: "x".repeat(POWER_ACTION_ID_MAX_LENGTH + 1) },
      { ...pick, handId: 0 },
      { ...pick, handId: 1.5 },
      { ...pick, handId: "3" },
    ]) {
      assert.ok(!isOnlinePickPowerAction(value), JSON.stringify(value));
      assert.ok(!isOnlineUsePowerUpAction(value && { ...value, tileId: "t-7" }), JSON.stringify(value));
    }
  });

  it("needs a tile to use a power on", () => {
    assert.ok(!isOnlineUsePowerUpAction(pick));
    assert.ok(!isOnlineUsePowerUpAction({ ...use, tileId: "" }));
    assert.ok(!isOnlineUsePowerUpAction({ ...use, tileId: 7 }));
    assert.ok(!isGameMessagePayload("usePowerUp", pick));
  });

  it("keeps an id at the length limit", () => {
    const actionId = "x".repeat(POWER_ACTION_ID_MAX_LENGTH);
    assert.ok(isOnlinePickPowerAction({ ...pick, actionId }));
  });
});

describe("online state and rejection shapes", () => {
  it("carries a server clock with every deadline", () => {
    const snapshot: GameTableState = {
      now: 1_000,
      table: {
        name: "Test",
        buyIn: 500,
        smallBlind: 5,
        bigBlind: 10,
        maxSeats: 2,
        powerUps: { deal: "off" },
      },
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

  it("names a refused power command by its action id and a power reason (STO-499)", () => {
    assert.ok(isGameRejectionEvent({ action: "pickPower", reason: "not-offered", actionId: "a1" }));
    assert.ok(isGameRejectionEvent({ action: "usePowerUp", reason: "outside-window", actionId: "a2" }));
    assert.ok(!isGameRejectionEvent({ action: "usePowerUp", reason: "outside-window" }), "no action id");
    assert.ok(!isGameRejectionEvent({ action: "pickPower", reason: "too-short", actionId: "a3" }));
  });
});
