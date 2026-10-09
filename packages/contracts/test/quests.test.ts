/** Quests on the wire: the claim a client POSTs, and the two routes' responses. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_HERO_SCORE,
  QUEST_IDS,
  STREAK_REWARDS,
  isQuestClaimResponse,
  isQuestHandClaim,
  isQuestId,
  isQuestStateResponse,
  type QuestHandFacts,
} from "../src/index";

const FACTS: QuestHandFacts = {
  revealed: true,
  heroWon: true,
  heroWord: "CAT",
  heroScore: 12,
  heroDecidedBy: "final-score",
  pot: 300,
  wildTable: false,
  heroUsedPower: false,
};

describe("QUEST_IDS", () => {
  it("has 15 unique ids", () => {
    assert.equal(QUEST_IDS.length, 15);
    assert.equal(new Set(QUEST_IDS).size, QUEST_IDS.length);
  });

  it("isQuestId accepts only catalog ids", () => {
    assert.ok(isQuestId("pot-500"));
    assert.ok(!isQuestId("pot-5000"));
  });
});

describe("STREAK_REWARDS", () => {
  it("has 7 positive entries", () => {
    assert.equal(STREAK_REWARDS.length, 7);
    assert.ok(STREAK_REWARDS.every((reward) => reward > 0));
  });
});

describe("isQuestHandClaim", () => {
  it("accepts a well-formed claim", () => {
    assert.ok(isQuestHandClaim({ handToken: "abc123", facts: FACTS }));
  });

  it("accepts a fold-out with no word and no decider", () => {
    assert.ok(
      isQuestHandClaim({
        handToken: "abc123",
        facts: { ...FACTS, revealed: false, heroWord: null, heroDecidedBy: null },
      }),
    );
  });

  it("refuses a bad token", () => {
    assert.ok(!isQuestHandClaim({ handToken: "", facts: FACTS }));
    assert.ok(!isQuestHandClaim({ facts: FACTS }));
  });

  it("refuses an oversized token, a non-rack word, and a non-integer or negative pot", () => {
    assert.ok(!isQuestHandClaim({ handToken: "x".repeat(65), facts: FACTS }));
    assert.ok(!isQuestHandClaim({ handToken: "a", facts: { ...FACTS, heroWord: "quiz" } }));
    assert.ok(!isQuestHandClaim({ handToken: "a", facts: { ...FACTS, heroWord: "ABCDEFGH" } }));
    assert.ok(!isQuestHandClaim({ handToken: "a", facts: { ...FACTS, pot: 1.5 } }));
    assert.ok(!isQuestHandClaim({ handToken: "a", facts: { ...FACTS, pot: -1 } }));
    assert.ok(isQuestHandClaim({ handToken: "a", facts: { ...FACTS, heroWord: "QUIZ" } }));
  });

  it("refuses facts with an unknown field type or out-of-range number", () => {
    for (const facts of [
      { ...FACTS, heroWon: "yes" },
      { ...FACTS, heroScore: "12" },
      { ...FACTS, heroScore: Number.NaN },
      // The XP column's guard: no fractional, negative, or capped-over score moves XP (STO-543).
      { ...FACTS, heroScore: -1 },
      { ...FACTS, heroScore: 12.5 },
      { ...FACTS, heroScore: MAX_HERO_SCORE + 1 },
      { ...FACTS, heroDecidedBy: "coin-flip" },
      { ...FACTS, pot: "300" },
    ]) {
      assert.ok(!isQuestHandClaim({ handToken: "abc123", facts }), JSON.stringify(facts));
    }
  });

  it("refuses a non-object", () => {
    assert.ok(!isQuestHandClaim(null));
    assert.ok(!isQuestHandClaim("abc123"));
  });
});

describe("isQuestStateResponse", () => {
  it("accepts a well-formed response", () => {
    assert.ok(
      isQuestStateResponse({
        streak: { current: 3, creditedToday: 100 },
        xp: 412,
        level: 3,
        quests: [{ id: "pot-500", progress: 1, done: true }],
      }),
    );
    assert.ok(
      isQuestStateResponse({ streak: { current: 0, creditedToday: null }, xp: 0, level: 1, quests: [] }),
    );
  });

  it("refuses an unknown quest id, a malformed streak, or a broken level", () => {
    assert.ok(
      !isQuestStateResponse({
        streak: { current: 0, creditedToday: null },
        xp: 0,
        level: 1,
        quests: [{ id: "not-a-quest", progress: 1, done: true }],
      }),
    );
    assert.ok(
      !isQuestStateResponse({ streak: { current: "0", creditedToday: null }, xp: 0, level: 1, quests: [] }),
    );
    for (const [xp, level] of [[undefined, 1], [0, undefined], [0, 0], [-1, 1], [1.5, 1], ["0", 1]] as const) {
      assert.ok(
        !isQuestStateResponse({ streak: { current: 0, creditedToday: null }, xp, level, quests: [] }),
        `${xp}/${level}`,
      );
    }
    assert.ok(!isQuestStateResponse(null));
  });
});

describe("isQuestClaimResponse", () => {
  it("accepts completed ids, a duplicate flag, and the XP standing", () => {
    assert.ok(isQuestClaimResponse({ completed: ["pot-500"], duplicate: false, xp: 37, level: 1 }));
    assert.ok(isQuestClaimResponse({ completed: [], duplicate: true, xp: 0, level: 1 }));
  });

  it("refuses an unknown completed id, a missing flag, or a broken level", () => {
    assert.ok(!isQuestClaimResponse({ completed: ["nope"], duplicate: false, xp: 37, level: 1 }));
    assert.ok(!isQuestClaimResponse({ completed: [], duplicate: false }));
    assert.ok(!isQuestClaimResponse({ completed: [], duplicate: true, xp: 0 }));
  });
});
