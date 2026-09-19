/**
 * This package exists so both sides of the socket describe the same bytes, and most of that
 * is a compile-time promise. These tests pin the runtime half a compiler cannot hold still:
 * the order of the round cycle and the exact membership of the action union.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROUND_PHASES, WAITING_PHASE, type OfflineAction, type PlayerId, type Tile } from "../src/index";

const OFFLINE_ACTIONS: readonly OfflineAction[] = [{ type: "deal" }, { type: "advance" }];

/** Fails to compile if a third action joins the union, or one of the two is renamed. */
function actionType(action: OfflineAction): string {
  switch (action.type) {
    case "deal":
    case "advance":
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
    const twoLetter = { id: "t2", letter: "U", alternativeLetter: "N", points: 1 } satisfies Tile;
    const dealt: Record<PlayerId, Tile[]> = { "session-1": [plain, twoLetter] };

    assert.deepEqual(JSON.parse(JSON.stringify(dealt)), dealt);
  });

  it("names every offline action", () => {
    assert.deepEqual(OFFLINE_ACTIONS.map(actionType), ["deal", "advance"]);
  });
});
