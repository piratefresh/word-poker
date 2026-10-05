import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuestHandFacts, QuestId } from "@wordpoker/contracts";
import { QUEST_IDS } from "@wordpoker/contracts";

import { QUEST_CATALOG, applyQuestHand, emptyQuestProgress } from "../src/quests";

const BASE: QuestHandFacts = {
  revealed: true,
  heroWon: false,
  heroWord: null,
  heroScore: 0,
  heroDecidedBy: null,
  pot: 0,
  wildTable: false,
  heroUsedPower: false,
};

function facts(overrides: Partial<QuestHandFacts>): QuestHandFacts {
  return { ...BASE, ...overrides };
}

describe("QUEST_CATALOG", () => {
  it("has one definition per catalog id, each with a goal and a reward", () => {
    assert.equal(QUEST_CATALOG.length, QUEST_IDS.length);
    assert.deepEqual(QUEST_CATALOG.map((def) => def.id).sort(), [...QUEST_IDS].sort());
    for (const def of QUEST_CATALOG) {
      assert.ok(def.goal >= 1, def.id);
      assert.ok(def.reward > 0, def.id);
    }
  });
});

describe("emptyQuestProgress", () => {
  it("starts every quest at zero and undone", () => {
    const empty = emptyQuestProgress();
    for (const id of QUEST_IDS) {
      assert.deepEqual(empty[id], { progress: 0, streak: 0, done: false });
    }
  });
});

describe("applyQuestHand — word-length ladder", () => {
  for (const [id, length] of [
    ["win-word-2", 2],
    ["win-word-3", 3],
    ["win-word-4", 4],
    ["win-word-5", 5],
    ["win-word-6", 6],
    ["win-word-7", 7],
  ] as const) {
    it(`${id} completes on a won showdown with a ${length}-letter word`, () => {
      const word = "X".repeat(length);
      const { next, completed } = applyQuestHand(
        emptyQuestProgress(),
        facts({ heroWon: true, heroWord: word, heroScore: length }),
      );
      assert.ok(completed.includes(id as QuestId), id);
      assert.equal(next[id as QuestId].done, true);
    });

    it(`${id} does not complete on a loss, a shorter word, or a fold-out`, () => {
      const word = "X".repeat(length);
      const lost = applyQuestHand(emptyQuestProgress(), facts({ heroWon: false, heroWord: word }));
      assert.ok(!lost.completed.includes(id as QuestId));

      const shorter = applyQuestHand(
        emptyQuestProgress(),
        facts({ heroWon: true, heroWord: "X".repeat(Math.max(1, length - 1)) }),
      );
      assert.ok(!shorter.completed.includes(id as QuestId));

      const foldOut = applyQuestHand(
        emptyQuestProgress(),
        facts({ revealed: false, heroWon: true, heroWord: null }),
      );
      assert.ok(!foldOut.completed.includes(id as QuestId));
    });
  }
});

describe("applyQuestHand — word-25", () => {
  it("completes on a won showdown worth 25 or more", () => {
    const { completed } = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, heroScore: 25 }));
    assert.ok(completed.includes("word-25"));
  });

  it("does not complete under 25", () => {
    const { completed } = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, heroScore: 24 }));
    assert.ok(!completed.includes("word-25"));
  });
});

describe("applyQuestHand — heavy-letter", () => {
  it("completes on a played word with J, X, Q or Z, win or lose", () => {
    for (const letter of ["J", "X", "Q", "Z"]) {
      const { completed } = applyQuestHand(
        emptyQuestProgress(),
        facts({ heroWon: false, heroWord: `CA${letter}` }),
      );
      assert.ok(completed.includes("heavy-letter"), letter);
    }
  });

  it("does not complete without a reveal or a heavy letter", () => {
    const noWord = applyQuestHand(emptyQuestProgress(), facts({ heroWord: "CAT" }));
    assert.ok(!noWord.completed.includes("heavy-letter"));

    const noReveal = applyQuestHand(
      emptyQuestProgress(),
      facts({ revealed: false, heroWon: true, heroWord: null }),
    );
    assert.ok(!noReveal.completed.includes("heavy-letter"));
  });
});

describe("applyQuestHand — pot-500", () => {
  it("completes on a won pot over 500, fold-out included", () => {
    const showdown = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, pot: 501 }));
    assert.ok(showdown.completed.includes("pot-500"));

    const foldOut = applyQuestHand(
      emptyQuestProgress(),
      facts({ revealed: false, heroWon: true, pot: 501 }),
    );
    assert.ok(foldOut.completed.includes("pot-500"));
  });

  it("does not complete at exactly 500 or on a loss", () => {
    const exact = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, pot: 500 }));
    assert.ok(!exact.completed.includes("pot-500"));

    const lost = applyQuestHand(emptyQuestProgress(), facts({ heroWon: false, pot: 1000 }));
    assert.ok(!lost.completed.includes("pot-500"));
  });
});

describe("applyQuestHand — fold-out", () => {
  it("completes only on an unrevealed win", () => {
    const { completed } = applyQuestHand(
      emptyQuestProgress(),
      facts({ revealed: false, heroWon: true }),
    );
    assert.ok(completed.includes("fold-out"));
  });

  it("does not complete on a revealed win", () => {
    const { completed } = applyQuestHand(emptyQuestProgress(), facts({ revealed: true, heroWon: true }));
    assert.ok(!completed.includes("fold-out"));
  });
});

describe("applyQuestHand — tile-draw", () => {
  it("completes only when the win was decided by the tile draw", () => {
    const { completed } = applyQuestHand(
      emptyQuestProgress(),
      facts({ heroWon: true, heroDecidedBy: "tile-draw" }),
    );
    assert.ok(completed.includes("tile-draw"));
  });

  it("does not complete when decided by score or word length", () => {
    const byScore = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, heroDecidedBy: "final-score" }));
    assert.ok(!byScore.completed.includes("tile-draw"));
  });
});

describe("applyQuestHand — wild-power-win", () => {
  it("completes only at a Wild table, winning, after using the power", () => {
    const { completed } = applyQuestHand(
      emptyQuestProgress(),
      facts({ heroWon: true, wildTable: true, heroUsedPower: true }),
    );
    assert.ok(completed.includes("wild-power-win"));
  });

  it("does not complete at a Classic table or without using the power", () => {
    const classic = applyQuestHand(
      emptyQuestProgress(),
      facts({ heroWon: true, wildTable: false, heroUsedPower: true }),
    );
    assert.ok(!classic.completed.includes("wild-power-win"));

    const unused = applyQuestHand(
      emptyQuestProgress(),
      facts({ heroWon: true, wildTable: true, heroUsedPower: false }),
    );
    assert.ok(!unused.completed.includes("wild-power-win"));
  });
});

describe("applyQuestHand — hands-25 and wins-10", () => {
  it("counts every hand toward hands-25, and only wins toward wins-10", () => {
    let map = emptyQuestProgress();
    for (let i = 0; i < 9; i += 1) {
      map = applyQuestHand(map, facts({ heroWon: i % 2 === 0 })).next;
    }
    assert.equal(map["hands-25"].progress, 9);
    assert.equal(map["wins-10"].progress, 5);
  });

  it("completes exactly at the goal", () => {
    let map = emptyQuestProgress();
    let completed: readonly QuestId[] = [];
    for (let i = 0; i < 25; i += 1) {
      const result = applyQuestHand(map, facts({ heroWon: false }));
      map = result.next;
      completed = result.completed;
    }
    assert.equal(map["hands-25"].progress, 25);
    assert.ok(completed.includes("hands-25"));
  });
});

describe("applyQuestHand — win-streak-3", () => {
  it("resets the streak on a loss and completes at 3 in a row", () => {
    let map = emptyQuestProgress();
    map = applyQuestHand(map, facts({ heroWon: true })).next;
    map = applyQuestHand(map, facts({ heroWon: false })).next;
    assert.equal(map["win-streak-3"].streak, 0);

    map = applyQuestHand(map, facts({ heroWon: true })).next;
    map = applyQuestHand(map, facts({ heroWon: true })).next;
    const third = applyQuestHand(map, facts({ heroWon: true }));
    assert.equal(third.next["win-streak-3"].streak, 3);
    assert.ok(third.completed.includes("win-streak-3"));
  });

  it("keeps the best streak reached as progress even after a later reset, short of the goal", () => {
    let map = emptyQuestProgress();
    for (let i = 0; i < 2; i += 1) map = applyQuestHand(map, facts({ heroWon: true })).next;
    map = applyQuestHand(map, facts({ heroWon: false })).next;
    assert.equal(map["win-streak-3"].progress, 2);
    assert.equal(map["win-streak-3"].streak, 0);
    assert.ok(!map["win-streak-3"].done);
  });
});

describe("applyQuestHand — purity and frozen completion", () => {
  it("never mutates the input map", () => {
    const input = emptyQuestProgress();
    const frozen = JSON.parse(JSON.stringify(input));
    applyQuestHand(input, facts({ heroWon: true, heroWord: "CAT", heroScore: 3 }));
    assert.deepEqual(input, frozen);
  });

  it("never re-completes a done quest, and reports it as already-done rather than newly completed", () => {
    let map = applyQuestHand(emptyQuestProgress(), facts({ heroWon: true, heroWord: "AB" })).next;
    assert.ok(map["win-word-2"].done);

    const again = applyQuestHand(map, facts({ heroWon: true, heroWord: "AB" }));
    assert.ok(!again.completed.includes("win-word-2"));
    assert.deepEqual(again.next["win-word-2"], map["win-word-2"]);
  });
});
