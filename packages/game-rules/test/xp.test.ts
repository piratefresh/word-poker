import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuestHandFacts } from "@wordpoker/contracts";
import { MAX_HERO_SCORE } from "@wordpoker/contracts";

import { levelForXp, levelReward, xpForHand, xpToReach } from "../src/xp";

const WINNER: QuestHandFacts = {
  revealed: true,
  heroWon: true,
  heroWord: "CAT",
  heroScore: 12,
  heroDecidedBy: "final-score",
  pot: 300,
  wildTable: false,
  heroUsedPower: false,
};

function facts(overrides: Partial<QuestHandFacts>): QuestHandFacts {
  return { ...WINNER, ...overrides };
}

describe("xpForHand", () => {
  it("pays ten for playing, fifteen for the win, and the word points", () => {
    assert.equal(xpForHand(WINNER), 37);
    assert.equal(xpForHand(facts({ heroWon: false, heroWord: null, heroScore: 0 })), 10);
    // A fold-out win: the pot without a reveal — the win bonus, no word points.
    assert.equal(xpForHand(facts({ revealed: false, heroWord: null, heroScore: 0 })), 25);
  });

  it("scales with the word score, up to the claim cap", () => {
    assert.equal(xpForHand(facts({ heroScore: MAX_HERO_SCORE })), 10 + 15 + MAX_HERO_SCORE);
  });
});

describe("levelForXp", () => {
  it("starts every player at level 1, one hand from level 2", () => {
    assert.deepEqual(levelForXp(0), { level: 1, intoLevel: 0, toNext: 100 });
    assert.deepEqual(levelForXp(99), { level: 1, intoLevel: 99, toNext: 1 });
  });

  it("crosses each threshold exactly at its cumulative cost", () => {
    assert.deepEqual(levelForXp(100), { level: 2, intoLevel: 0, toNext: 183 });
    assert.deepEqual(levelForXp(282), { level: 2, intoLevel: 182, toNext: 1 });
    assert.deepEqual(levelForXp(283), { level: 3, intoLevel: 0, toNext: 237 });
  });

  it("lands a multi-level jump on the highest level reached", () => {
    assert.deepEqual(levelForXp(3000), { level: 10, intoLevel: 300, toNext: 162 });
  });

  it("keeps intoLevel and toNext a whole level apart, at every checkpoint", () => {
    for (let xp = 0; xp <= 5000; xp += 37) {
      const { level, intoLevel, toNext } = levelForXp(xp);
      assert.equal(intoLevel + toNext, xpToReach(level + 1) - xpToReach(level), `at ${xp} xp`);
      assert.ok(intoLevel >= 0 && toNext > 0, `at ${xp} xp`);
    }
  });
});

describe("levelReward", () => {
  it("pays fifty coins per level", () => {
    assert.equal(levelReward(1), 50);
    assert.equal(levelReward(4), 200);
    assert.equal(levelReward(7), 350);
  });

  it("doubles every 5th level", () => {
    assert.equal(levelReward(5), 500);
    assert.equal(levelReward(10), 1000);
    assert.equal(levelReward(15), 1500);
  });
});
