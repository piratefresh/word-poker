/**
 * This package exists so both sides of the socket describe the same bytes, and most of that
 * is a compile-time promise. These tests pin the runtime half a compiler cannot hold still:
 * the order of the round cycle and the exact membership of the action union.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DICTIONARY_IDS,
  ROUND_PHASES,
  WAITING_PHASE,
  WORD_REJECTION_REASONS,
  isDictionaryId,
  isWordSubmission,
  type OfflineAction,
  type PlayerId,
  type Tile,
  type WordSubmission,
} from "../src/index";

const OFFLINE_ACTIONS: readonly OfflineAction[] = [
  { type: "deal" },
  { type: "advance" },
  { type: "draftWord", playerId: "hero", submission: { plays: [{ tileId: "M-1" }] } },
  { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: "M-1" }] } },
  { type: "timeoutWords" },
];

/** Fails to compile if an action joins the union, or one of them is renamed. */
function actionType(action: OfflineAction): string {
  switch (action.type) {
    case "deal":
    case "advance":
    case "draftWord":
    case "confirmWord":
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
    const sequence = {
      id: "t3",
      letter: "T",
      sequenceLetter: "H",
      points: 2,
      sequencePoints: 5,
    } satisfies Tile;
    const dealt: Record<PlayerId, Tile[]> = { "session-1": [plain, choice, sequence] };

    assert.deepEqual(JSON.parse(JSON.stringify(dealt)), dealt);
  });

  it("lets building tell a sequence tile from a choice tile", () => {
    // The whole point of the union: an A/E tile and a TH tile are not the same shape, and
    // the discriminator is which second face the tile carries, not a flag either could
    // carry wrongly. A `satisfies Tile` on the wrong shape is a compile error.
    const choice = {
      id: "ae-1",
      letter: "A",
      alternativeLetter: "E",
      points: 1,
      alternativePoints: 1,
    } satisfies Tile;
    const sequence = { id: "th-1", letter: "T", sequenceLetter: "H", points: 2, sequencePoints: 5 } satisfies Tile;

    assert.ok("alternativeLetter" in choice);
    assert.ok(!("sequenceLetter" in choice));
    assert.ok("sequenceLetter" in sequence);
    assert.ok(!("alternativeLetter" in sequence));
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
      "advance",
      "draftWord",
      "confirmWord",
      "timeoutWords",
    ]);
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
      "two-letter-split",
      "sequence-reversed",
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
