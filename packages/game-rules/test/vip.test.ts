import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { VipHandFacts } from "@wordpoker/contracts";

import {
  VIP_DAILY_PLAY_CAP,
  VIP_TIERS,
  applyVipEarn,
  vipPointsForHand,
  vipProgress,
  vipPurchaseBonus,
  vipStreakPoints,
  vipTierFor,
  vipTierRewards,
} from "../src/vip";

const SHOWDOWN: VipHandFacts = {
  completed: true,
  showdown: true,
  wordLength: 6,
  usedEveryTile: false,
  bestWord: true,
  committed: 140,
  wonAllIn: false,
  handInSession: 3,
  betting: true,
};

const facts = (o: Partial<VipHandFacts>): VipHandFacts => ({ ...SHOWDOWN, ...o });

describe("vipPointsForHand", () => {
  it("pays play, word and bet points at showdown", () => {
    assert.deepEqual(vipPointsForHand(SHOWDOWN), { play: 10, word: 20, bet: 14 });
  });

  it("scores word length 4..8+", () => {
    const word = (n: number) => vipPointsForHand(facts({ wordLength: n, bestWord: false })).word;
    assert.deepEqual([3, 4, 5, 6, 7, 8, 9].map(word), [0, 2, 5, 10, 20, 40, 40]);
  });

  it("adds +15 for every tile and +10 for best word", () => {
    assert.equal(vipPointsForHand(facts({ wordLength: 7, usedEveryTile: true, bestWord: true })).word, 45);
  });

  it("caps bet points at 50, counting the all-in win bonus", () => {
    assert.equal(vipPointsForHand(facts({ committed: 300, wonAllIn: true })).bet, 50);
    assert.equal(vipPointsForHand(facts({ committed: 200, wonAllIn: true })).bet, 40);
  });

  it("pays no bet points offline, and only play points without a showdown", () => {
    assert.equal(vipPointsForHand(facts({ betting: false })).bet, 0);
    assert.deepEqual(vipPointsForHand(facts({ showdown: false })), { play: 10, word: 0, bet: 0 });
  });

  it("pays nothing for a hand folded before the river", () => {
    assert.deepEqual(vipPointsForHand(facts({ completed: false, showdown: false })), { play: 0, word: 0, bet: 0 });
  });

  it("adds +50 on every 10th hand of a session", () => {
    assert.equal(vipPointsForHand(facts({ handInSession: 10 })).play, 60);
    assert.equal(vipPointsForHand(facts({ handInSession: 11 })).play, 10);
  });
});

describe("applyVipEarn", () => {
  it("multiplies by tier before capping play points only", () => {
    const r = applyVipEarn({ play: 60, word: 40, bet: 50 }, 6, VIP_DAILY_PLAY_CAP - 20);
    assert.deepEqual(r, { play: 20, word: 60, bet: 75, added: 155, playToday: VIP_DAILY_PLAY_CAP });
  });

  it("adds no play points once the cap is reached", () => {
    assert.equal(applyVipEarn({ play: 10, word: 0, bet: 0 }, 0, VIP_DAILY_PLAY_CAP).play, 0);
  });
});

describe("tiers", () => {
  it("names the tier a total has reached", () => {
    assert.equal(vipTierFor(0), 0);
    assert.equal(vipTierFor(1_499), 0);
    assert.equal(vipTierFor(1_500), 1);
    assert.equal(vipTierFor(600_000), 6);
    assert.equal(vipTierFor(10_000_000), 6);
  });

  it("reports progress to the next tier", () => {
    assert.deepEqual(vipProgress(6_900), { tier: 1, next: 2, toNext: 600, fraction: 0.9 });
    assert.equal(vipProgress(700_000).next, null);
  });

  it("pays every tier crossed, once each", () => {
    assert.deepEqual(vipTierRewards(0, 2), [
      { tier: 1, coins: 100 },
      { tier: 2, coins: 300 },
    ]);
    assert.deepEqual(vipTierRewards(2, 2), []);
  });

  it("has seven tiers in rising order", () => {
    assert.equal(VIP_TIERS.length, 7);
    VIP_TIERS.slice(1).forEach((t, i) => assert.ok(t.threshold > (VIP_TIERS[i]?.threshold ?? Infinity)));
  });
});

describe("streak and purchase", () => {
  it("pays 20 per streak day from day 2 to day 7, cycling", () => {
    assert.deepEqual([1, 2, 3, 7, 8, 9].map(vipStreakPoints), [0, 40, 60, 140, 0, 40]);
  });

  it("adds the tier's purchase bonus percent", () => {
    assert.equal(vipPurchaseBonus(1_000, 0), 0);
    assert.equal(vipPurchaseBonus(1_000, 2), 100);
    assert.equal(vipPurchaseBonus(10_000, 6), 4_000);
  });
});
