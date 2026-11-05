import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bestWordToTeach } from "../src/bot/bot-word";
import { fixedDeal } from "../src/tiles/fixed-deal";
import { loadDictionary } from "../src/words/dictionary";

describe("bestWordToTeach", () => {
  it("among words tied on score, prefers the one that plays more of the player's own tiles", async () => {
    const dictionary = await loadDictionary();
    // First Hand's deal: BANKS, BONKS and KNOBS all score 14; BANKS plays only the B of B and O.
    const deal = fixedDeal({ seed: 1, playerCount: 2, spec: { hands: { 0: ["B", "O"] }, board: ["A", "T", "S", "K", "N"] } });
    const own = deal.privateTiles[0]!;
    const word = bestWordToTeach({ available: [...own, ...deal.community], dictionary }, new Set(own.map((tile) => tile.id)));
    assert.equal(word?.score, 14);
    assert.notEqual(word?.word, "BANKS");
    assert.deepEqual([...word!.word].filter((letter) => "BO".includes(letter)).sort(), ["B", "O"]);
  });

  it("is null when nothing is buildable", async () => {
    const dictionary = await loadDictionary();
    assert.equal(bestWordToTeach({ available: [], dictionary }, new Set()), null);
  });
});
