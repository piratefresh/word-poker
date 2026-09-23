/**
 * This package exists so both sides of the socket describe the same bytes, and most of that
 * is a compile-time promise. These tests pin the runtime half a compiler cannot hold still:
 * the order of the round cycle and the exact membership of the action union.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BETTING_ACTIONS,
  BETTING_REJECTION_REASONS,
  DICTIONARY_IDS,
  ROUND_PHASES,
  WAITING_PHASE,
  WORD_REJECTION_REASONS,
  isBettingAction,
  isDictionaryId,
  isWordSubmission,
  type OfflineAction,
  type PlayerId,
  type Tile,
  type WordSubmission,
} from "../src/index";

const OFFLINE_ACTIONS: readonly OfflineAction[] = [
  { type: "deal" },
  { type: "fold", playerId: "hero" },
  { type: "check", playerId: "hero" },
  { type: "bet", playerId: "hero", amount: 20 },
  { type: "call", playerId: "hero" },
  { type: "raise", playerId: "hero", amount: 40 },
  { type: "allIn", playerId: "hero" },
  { type: "draftWord", playerId: "hero", submission: { plays: [{ tileId: "M-1" }] } },
  { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: "M-1" }] } },
  { type: "timeoutTurn" },
  { type: "foldTurn" },
  { type: "timeoutWords" },
];

/** Fails to compile if an action joins the union, or one of them is renamed. */
function actionType(action: OfflineAction): string {
  switch (action.type) {
    case "deal":
    case "fold":
    case "check":
    case "bet":
    case "call":
    case "raise":
    case "allIn":
    case "draftWord":
    case "confirmWord":
    case "timeoutTurn":
    case "foldTurn":
    case "timeoutWords":
      return action.type;
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

describe("ROUND_PHASES", () => {
  it("pins the order a table advances through", () => {
    // A table walks this array by index and deals a fresh hand past the last entry, so
    // reordering or renaming a phase changes the wire for every client.
    assert.deepEqual([...ROUND_PHASES], ["preflop", "flop", "turn", "river", "payout"]);
  });

  it("keeps the waiting room out of the cycle", () => {
    assert.ok(!(ROUND_PHASES as readonly string[]).includes(WAITING_PHASE));
  });
});

describe("wire shapes", () => {
  it("round-trips a dealt hand through JSON", () => {
    const plain = { id: "t1", letter: "Q", points: 10 } satisfies Tile;
    const choice = {
      id: "t2",
      letter: "U",
      alternativeLetter: "N",
      points: 1,
      alternativePoints: 2,
    } satisfies Tile;
    const dealt: Record<PlayerId, Tile[]> = { "session-1": [plain, choice] };

    assert.deepEqual(JSON.parse(JSON.stringify(dealt)), dealt);
  });

  it("tells a choice tile from a single letter by the second face it carries", () => {
    // The whole point of the union: an A/E tile and a plain A are not the same shape, and the
    // discriminator is the second face the tile carries, not a flag either could carry
    // wrongly. A `satisfies Tile` on the wrong shape is a compile error.
    const choice = {
      id: "ae-1",
      letter: "A",
      alternativeLetter: "E",
      points: 1,
      alternativePoints: 1,
    } satisfies Tile;
    const plain = { id: "a-1", letter: "A", points: 1 } satisfies Tile;

    assert.ok("alternativeLetter" in choice);
    assert.ok(!("alternativeLetter" in plain));
  });

  it("carries a printed multiplier on the physical tile", () => {
    const doubled = {
      id: "m-1",
      letter: "M",
      points: 4,
      multiplier: "double-letter",
    } satisfies Tile;

    assert.equal(doubled.multiplier, "double-letter");
  });

  it("names every offline action", () => {
    assert.deepEqual(OFFLINE_ACTIONS.map(actionType), [
      "deal",
      "fold",
      "check",
      "bet",
      "call",
      "raise",
      "allIn",
      "draftWord",
      "confirmWord",
      "timeoutTurn",
      "foldTurn",
      "timeoutWords",
    ]);
  });
});

describe("betting vocabulary", () => {
  it("pins the actions and their order", () => {
    assert.deepEqual([...BETTING_ACTIONS], ["fold", "check", "bet", "call", "raise", "allIn"]);
  });

  it("pins every §15/§22/§23 refusal reason", () => {
    // The same contract as the word reasons: both sides switch on these strings, so
    // reordering or renaming one is a wire change.
    assert.deepEqual([...BETTING_REJECTION_REASONS], [
      "not-your-turn",
      "not-in-hand",
      "already-folded",
      "already-all-in",
      "hand-over",
      "check-facing-bet",
      "no-bet-to-call",
      "bet-facing-bet",
      "below-min-bet",
      "below-min-raise",
      "insufficient-stack",
      "action-closed",
      "turn-timeout",
    ]);
  });

  it("accepts a well-formed action of every kind", () => {
    const valid: readonly unknown[] = [
      { type: "fold", playerId: "hero" },
      { type: "check", playerId: "hero" },
      { type: "bet", playerId: "hero", amount: 20 },
      { type: "call", playerId: "hero" },
      { type: "raise", playerId: "hero", amount: 40 },
      { type: "allIn", playerId: "hero" },
    ];

    for (const value of valid) {
      assert.ok(isBettingAction(value), `expected ${JSON.stringify(value)} to pass`);
    }
  });

  it("rejects anything that is not a betting action", () => {
    const malformed: readonly unknown[] = [
      null,
      undefined,
      "fold",
      7,
      [],
      {},
      { type: "fold" },
      { type: "fold", playerId: "" },
      { type: "fold", playerId: 7 },
      { type: "allIn", playerId: null },
      { type: "advance", playerId: "hero" },
      { type: "bet", playerId: "hero" },
      { type: "bet", playerId: "hero", amount: "20" },
      { type: "bet", playerId: "hero", amount: -20 },
      { type: "bet", playerId: "hero", amount: 2.5 },
      { type: "raise", playerId: "hero", amount: "x" },
    ];

    for (const value of malformed) {
      assert.ok(!isBettingAction(value), `expected ${JSON.stringify(value) ?? "undefined"} to be refused`);
    }
  });
});

describe("word submissions", () => {
  it("round-trips a well-formed submission through JSON", () => {
    const submission: WordSubmission = {
      plays: [{ tileId: "AE-1", chosenFace: "E" }, { tileId: "T-1" }, { tileId: "TH-2" }],
    };

    const parsed: unknown = JSON.parse(JSON.stringify(submission));

    assert.ok(isWordSubmission(parsed));
    assert.deepEqual(parsed, submission);
  });

  it("accepts an empty submission — refusing it is the engine's call, not the socket's", () => {
    assert.ok(isWordSubmission({ plays: [] }));
  });

  it("rejects anything that is not a submission", () => {
    const malformed: readonly unknown[] = [
      null,
      undefined,
      "MARKET",
      7,
      [],
      {},
      { plays: null },
      { plays: "M-1" },
      { plays: [{}] },
      { plays: [{ tileId: "" }] },
      { plays: [{ tileId: 7 }] },
      { plays: [{ tileId: "M-1", chosenFace: 3 }] },
    ];

    for (const value of malformed) {
      assert.ok(!isWordSubmission(value), `expected ${JSON.stringify(value) ?? "undefined"} to be refused`);
    }
  });

  it("pins every §11 refusal reason", () => {
    // Both sides switch on these strings, so reordering or renaming one is a wire change.
    assert.deepEqual([...WORD_REJECTION_REASONS], [
      "empty-submission",
      "too-short",
      "too-long",
      "uses-unavailable-letters",
      "tile-reused",
      "not-in-dictionary",
      "timer-expired",
    ]);
  });

  it("names the word lists a table can be configured with", () => {
    assert.deepEqual([...DICTIONARY_IDS], ["en_US-large"]);
    assert.ok(isDictionaryId("en_US-large"));
    assert.ok(!isDictionaryId("TWL"));
  });
});
