import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HAND_RECORD_MAX_ACTIONS,
  HAND_RECORD_MAX_BYTES,
  POWER_UP_IDS,
  isHandRecord,
  parseHandRecord,
  type HandRecord,
  type RecordedHandAction,
} from "../src/index";

function record(): HandRecord {
  return {
    version: 1,
    sessionId: "b2bc3c57-bc1d-4aa4-9aab-7432ac455600",
    handNo: 1,
    mode: "offline",
    ranked: false,
    startedAtMs: 1000,
    endedAtMs: 2000,
    seed: 42,
    dealerSeat: 0,
    rulesVersion: "1",
    dictionaryId: "en_US-large",
    dictionaryFingerprint: "a".repeat(64),
    config: { smallBlind: 10, bigBlind: 20, turnDurationMs: 60000, autoSubmitDrafts: false, powerUpDeal: "off" },
    seats: [
      { playerId: "hero", userId: "user-1", name: "Hero", initialStack: 1000 },
      { playerId: "bot", userId: null, name: "Bot", initialStack: 1000 },
    ],
    actions: [{ sequence: 0, atMs: 2000, source: "player", action: { type: "fold", playerId: "hero" } }],
    summary: {
      outcome: "fold-out",
      community: Array.from({ length: 5 }, (_, i) => ({ id: `board-${i}`, letter: "A", points: 1 })),
      seats: ["hero", "bot"].map((playerId) => ({
        playerId, privateTiles: [], submission: null, word: null, score: 0, reason: null,
        place: null, finalStack: playerId === "hero" ? 990 : 1010,
      })),
      pots: [{ amount: 30, eligible: ["bot"], winners: ["bot"] }],
    },
  };
}

describe("hand record boundary", () => {
  it("round-trips an unranked offline fold-out and a ranked online split/timeout snapshot", () => {
    const offline = record();
    assert.deepEqual(parseHandRecord(JSON.stringify(offline)), offline);
    const online = {
      ...offline, mode: "online", ranked: true,
      summary: {
        ...offline.summary, outcome: "showdown",
        seats: offline.summary.seats.map((seat) => ({ ...seat, place: 1, reason: "timer-expired" })),
        pots: [{ amount: 40, eligible: ["hero", "bot"], winners: ["hero", "bot"] }],
      },
    };
    assert.ok(isHandRecord(online));
  });

  it("records every reducer action, including drafts, checks, bots, powers and clock/disconnect actions", () => {
    const actions: RecordedHandAction[] = [
      { type: "check", playerId: "hero" }, { type: "call", playerId: "hero" },
      { type: "bet", playerId: "hero", amount: 40 }, { type: "raise", playerId: "hero", amount: 80 },
      { type: "allIn", playerId: "hero" }, { type: "fold", playerId: "hero" },
      { type: "checkWord", playerId: "hero", submission: { plays: [] } },
      { type: "draftWord", playerId: "hero", submission: { plays: [{ tileId: "tile", chosenFace: "A" }] } },
      { type: "confirmWord", playerId: "hero", submission: { plays: [] } },
      { type: "timeoutTurn" }, { type: "foldTurn" }, { type: "timeoutWords" }, { type: "timeoutPowerDraw" },
      ...POWER_UP_IDS.flatMap((powerUpId): RecordedHandAction[] => [
        { type: "pickPower", playerId: "hero", powerUpId },
        { type: "usePowerUp", playerId: "hero", powerUpId, tileId: "private-tile" },
      ]),
    ];
    const value = record();
    assert.ok(isHandRecord({ ...value, actions: actions.map((action, sequence) => ({
      sequence, atMs: 1000 + sequence, source: "bot", action,
    })) }));
  });

  it("rejects invalid identities, versions, bounds, seat references and ordering", () => {
    const base = record();
    const invalid: unknown[] = [
      null, { ...base, version: 2 }, { ...base, sessionId: "not-a-uuid" }, { ...base, ranked: true },
      { ...base, handNo: 0 }, { ...base, seed: NaN }, { ...base, dealerSeat: 2 },
      { ...base, endedAtMs: 999 }, { ...base, dictionaryFingerprint: "unknown" },
      { ...base, seats: [base.seats[0], base.seats[0]] }, { ...base, seats: Array(5).fill(base.seats[0]) },
      { ...base, actions: Array(HAND_RECORD_MAX_ACTIONS + 1).fill(base.actions[0]) },
      { ...base, actions: [{ ...base.actions[0], sequence: 1 }] },
      { ...base, actions: [{ ...base.actions[0], atMs: 2001 }] },
      { ...base, actions: [{ ...base.actions[0], action: { type: "deal" } }] },
      { ...base, actions: [{ ...base.actions[0], action: { type: "fold", playerId: "stranger" } }] },
      { ...base, summary: { ...base.summary, pots: [{ amount: 30, eligible: ["bot"], winners: ["hero"] }] } },
      { ...base, summary: { ...base.summary, seats: [base.summary.seats[0], base.summary.seats[0]] } },
      { ...base, summary: { ...base.summary, seats: base.summary.seats.map((seat) => ({ ...seat, word: "" })) } },
      { ...base, extra: "x".repeat(HAND_RECORD_MAX_BYTES) },
    ];
    for (const value of invalid) assert.equal(isHandRecord(value), false);
    assert.equal(parseHandRecord("{"), null);
    assert.equal(parseHandRecord(" ".repeat(HAND_RECORD_MAX_BYTES + 1)), null);
    assert.equal(parseHandRecord(JSON.stringify({ ...base, extra: "é".repeat(HAND_RECORD_MAX_BYTES / 2) })), null);
    assert.equal(isHandRecord({ ...base, actions: [
      { ...base.actions[0], atMs: 1500 }, { ...base.actions[0], sequence: 1, atMs: 1400 },
    ] }), false);
  });
});
