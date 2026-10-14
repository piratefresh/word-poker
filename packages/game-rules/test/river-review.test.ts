import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";
import { topWords } from "../src/bot/bot-word";
import { reduce, startHand } from "../src/table/offline";
import { riverReview } from "../src/words/river-review";
import { testDictionary } from "./fixtures";

const NOW = 1_000_000;
const PLAYERS = ["hero", "ellis", "jay", "mira"];
const DICTIONARY = testDictionary(["AT", "RAT", "STAR", "TARS", "ART"]);

function tile(id: string, letter: string, points = 1): Tile {
  return { id, letter, points };
}

describe("topWords", () => {
  const available = [tile("a", "A"), tile("r", "R"), tile("t", "T"), tile("s", "S")];

  it("returns the best distinct words, highest score first", () => {
    const words = topWords({ available, dictionary: DICTIONARY }, 3);
    assert.equal(words.length, 3);
    assert.equal(new Set(words.map((entry) => entry.word)).size, 3);
    assert.ok(words.every((entry, index) => index === 0 || (words[index - 1]?.score ?? 0) >= entry.score));
    assert.ok(["STAR", "TARS"].includes(words[0]?.word ?? ""));
  });

  it("returns fewer when fewer are buildable", () => {
    assert.deepEqual(topWords({ available: [tile("q", "Q")], dictionary: DICTIONARY }, 3), []);
  });
});

describe("riverReview", () => {
  function pickedHand(power: "river_review" | "random_wild") {
    let state = startHand({ seed: 62, players: PLAYERS, nowMs: NOW, dictionary: DICTIONARY, powerUps: { deal: "choose3" } });
    for (const slot of state.powers?.draw.slots ?? []) {
      state = reduce(state, { type: "pickPower", playerId: slot.playerId, powerUpId: power }, NOW);
    }
    return state;
  }

  it("is private to a holder and only readable once the hand has paid out", () => {
    const state = pickedHand("river_review");
    assert.equal(riverReview(state, "hero"), null);
    assert.ok(riverReview({ ...state, phase: "payout" }, "hero") !== null);
    assert.equal(riverReview({ ...pickedHand("random_wild"), phase: "payout" }, "hero"), null);
  });
});
