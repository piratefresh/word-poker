/** Quests on the wire: the claim a client POSTs, and the two routes' responses. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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

  it("refuses facts with an unknown field type or out-of-range number", () => {
    for (const facts of [
      { ...FACTS, heroWon: "yes" },
      { ...FACTS, heroScore: "12" },
      { ...FACTS, heroScore: Number.NaN },
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
        quests: [{ id: "pot-500", progress: 1, done: true }],
      }),
    );
    assert.ok(
      isQuestStateResponse({ streak: { current: 0, creditedToday: null }, quests: [] }),
    );
  });

  it("refuses an unknown quest id or a malformed streak", () => {
    assert.ok(
      !isQuestStateResponse({
        streak: { current: 0, creditedToday: null },
        quests: [{ id: "not-a-quest", progress: 1, done: true }],
      }),
    );
    assert.ok(!isQuestStateResponse({ streak: { current: "0", creditedToday: null }, quests: [] }));
    assert.ok(!isQuestStateResponse(null));
  });
});

describe("isQuestClaimResponse", () => {
  it("accepts completed ids and a duplicate flag", () => {
    assert.ok(isQuestClaimResponse({ completed: ["pot-500"], duplicate: false }));
    assert.ok(isQuestClaimResponse({ completed: [], duplicate: true }));
  });

  it("refuses an unknown completed id or a missing flag", () => {
    assert.ok(!isQuestClaimResponse({ completed: ["nope"], duplicate: false }));
    assert.ok(!isQuestClaimResponse({ completed: [] }));
  });
});
