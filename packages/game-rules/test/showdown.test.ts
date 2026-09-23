import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LetterMultiplier, WordScore } from "@wordpoker/contracts";

import { createRng } from "../src/rng";
import {
  DrawPoolExhaustedError,
  NoContestantsError,
  rankShowdown,
  showdownDrawPool,
  showdownDrawValue,
  type ShowdownEntry,
} from "../src/showdown";
import { TILE_BAG_SIZE } from "../src/tiles";

/**
 * One word's §7 breakdown, built straight from its printed letters — the shape scoring hands
 * the showdown. A multiplier is applied to the letter's `value` and never to its
 * `baseValue`, which is where §7 puts the two numbers apart.
 */
function word(
  letters: readonly (readonly [letter: string, baseValue: number, multiplier?: LetterMultiplier])[],
  fullRackBonus = 0,
): WordScore {
  const scored = letters.map(([letter, baseValue, multiplier]) => ({
    letter,
    baseValue,
    ...(multiplier === undefined ? {} : { multiplier }),
    value: baseValue * (multiplier === "double-letter" ? 2 : multiplier === "triple-letter" ? 3 : 1),
  }));
  const letterScore = scored.reduce((total, letter) => total + letter.value, 0);

  return { letters: scored, letterScore, fullRackBonus, total: letterScore + fullRackBonus };
}

/** A seat contesting the showdown; no `word` means it had no valid one, which §11 scores 0. */
function entry(playerId: string, seat: number, score?: WordScore): ShowdownEntry {
  return { playerId, seat, ...(score === undefined ? {} : { word: score }) };
}

describe("rankShowdown — §20: the ranking", () => {
  it("places every seat by final score, best first", () => {
    const ranking = rankShowdown({
      entries: [
        entry("middle", 1, word([["O", 1], ["P", 4]])),
        entry("top", 3, word([["Q", 10], ["Z", 10]])),
        entry("low", 0, word([["A", 1], ["E", 1]])),
      ],
      rng: createRng(1),
    });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.score, standing.decidedBy, standing.compared]),
      [
        ["top", 1, 20, "final-score", 20],
        ["middle", 2, 5, "final-score", 5],
        ["low", 3, 2, "final-score", 2],
      ],
    );
    // Nobody tied, so the score is the only comparison the ladder had to make.
    assert.deepEqual(ranking.comparisons.map((comparison) => comparison.step), ["final-score"]);
  });

  it("keeps a seat with no valid word in the ranking, at 0 points (§11)", () => {
    const ranking = rankShowdown({
      entries: [
        entry("seven", 0, word([["T", 2], ["H", 5]])),
        entry("nothing", 1),
        entry("nine", 2, word([["K", 5], ["A", 1], ["D", 3]])),
      ],
      rng: createRng(2),
    });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.score]),
      [
        ["nine", 1, 9],
        ["seven", 2, 7],
        ["nothing", 3, 0],
      ],
    );
  });

  it("ranks a lone contestant by score, and draws nothing for it", () => {
    const rng = (): number => {
      throw new Error("a showdown of one has no tie to break, so no tile may be drawn");
    };

    const ranking = rankShowdown({ entries: [entry("only", 2, word([["B", 4], ["D", 3]]))], rng });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.decidedBy, standing.compared]),
      [["only", 1, "final-score", 7]],
    );
    assert.deepEqual(ranking.comparisons, []);
  });

  it("refuses a showdown with nobody in it", () => {
    assert.throws(() => rankShowdown({ entries: [], rng: createRng(1) }), NoContestantsError);
  });

  it("places the field the same way whatever order the seats are listed in", () => {
    const entries = [
      entry("a", 0, word([["T", 2], ["A", 1], ["D", 3]])),
      entry("b", 1, word([["T", 2], ["A", 1], ["D", 3]])),
      entry("c", 2, word([["O", 1], ["P", 4]])),
    ];

    const forwards = rankShowdown({ entries, rng: createRng(5) });
    const backwards = rankShowdown({ entries: [...entries].reverse(), rng: createRng(5) });

    assert.deepEqual(forwards, backwards);
  });
});

describe("rankShowdown — §21.1: longest valid word", () => {
  it("ranks the longer word first when the scores are equal", () => {
    const ranking = rankShowdown({
      entries: [
        entry("short", 0, word([["B", 4], ["D", 3]])),
        entry("long", 1, word([["K", 5], ["A", 1], ["O", 1]])),
      ],
      rng: createRng(3),
    });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.decidedBy, standing.compared]),
      [
        ["long", "word-length", 3],
        ["short", "word-length", 2],
      ],
    );
  });

  it("passes seats tied on length to the draw", () => {
    const ranking = rankShowdown({
      entries: [
        entry("q", 0, word([["Q", 10], ["A", 1]])),
        entry("j", 1, word([["J", 8], ["D", 3]])),
      ],
      rng: createRng(6),
    });

    // Equal scores and equal lengths leave §21's word steps spent, so §21.3 draws — and its
    // tiles, not the letters in either word, are what the seats end up compared on.
    assert.deepEqual(ranking.comparisons.map((comparison) => comparison.step), [
      "final-score",
      "word-length",
      "tile-draw",
    ]);
    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.decidedBy, standing.compared]),
      [
        ["q", "tile-draw", 4],
        ["j", "tile-draw", 1],
      ],
    );
  });
});

describe("rankShowdown — §21.3: the high-value tile draw", () => {
  /** Two seats identical the whole way down: same score and same length, so the draw decides. */
  const identical = (): ShowdownEntry[] => [
    entry("one", 0, word([["T", 2], ["A", 1], ["D", 3]])),
    entry("two", 1, word([["T", 2], ["A", 1], ["D", 3]])),
  ];

  it("adds a round's tile to what the seat has already drawn, as §21.3's example does", () => {
    // The rules' own worked example — A then Z is 11, A then T is 3 — on a seed that deals
    // it: both seats take a 1, draw again, and the second tile adds to the first.
    const ranking = rankShowdown({
      entries: [
        entry("ana", 0, word([["T", 2], ["A", 1], ["D", 3]])),
        entry("ben", 1, word([["T", 2], ["A", 1], ["D", 3]])),
      ],
      rng: createRng(369),
    });

    assert.deepEqual(
      ranking.comparisons
        .filter((comparison) => comparison.step === "tile-draw")
        .map((comparison) => [
          comparison.round,
          comparison.values.map((value) => [value.playerId, value.value]),
        ]),
      [
        [1, [["ana", 1], ["ben", 1]]],
        [
          2,
          [
            ["ana", 11],
            ["ben", 3],
          ],
        ],
      ],
    );
    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.compared]),
      [
        ["ana", 1, 11],
        ["ben", 2, 3],
      ],
    );
  });

  it("draws again only among the seats sharing the highest total", () => {
    const ranking = rankShowdown({
      entries: [
        entry("one", 0, word([["T", 2], ["A", 1], ["D", 3]])),
        entry("two", 1, word([["T", 2], ["A", 1], ["D", 3]])),
        entry("three", 2, word([["T", 2], ["A", 1], ["D", 3]])),
      ],
      rng: createRng(42),
    });

    // One and three tie on 5 and draw on; two is beaten on 1 and is placed. The later rounds
    // report running totals, so a seat's number only grows: 6 is 5 + 1 for both of them.
    assert.deepEqual(
      ranking.comparisons
        .filter((comparison) => comparison.step === "tile-draw")
        .map((comparison) => [
          comparison.round,
          comparison.values.map((value) => [value.playerId, value.value]),
        ]),
      [
        [1, [["one", 5], ["three", 5], ["two", 1]]],
        [2, [["one", 6], ["three", 6]]],
        [3, [["one", 10], ["three", 8]]],
      ],
    );
    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.compared]),
      [
        ["one", 1, 10],
        ["three", 2, 8],
        ["two", 3, 1],
      ],
    );
  });

  it("replays the same draw for the same seed, and lets the seed pick the winner", () => {
    const first = rankShowdown({ entries: identical(), rng: createRng(7) });
    const again = rankShowdown({ entries: identical(), rng: createRng(7) });

    assert.deepEqual(first, again);
    assert.deepEqual(
      first.standings.map((standing) => [standing.playerId, standing.place, standing.decidedBy, standing.compared]),
      [
        ["one", 1, "tile-draw", 6],
        ["two", 2, "tile-draw", 5],
      ],
    );

    // A different seed draws the same two tiles the other way round, and hands the hand to
    // the other seat: the winner comes out of the draw, not out of the seat numbers.
    const other = rankShowdown({ entries: identical(), rng: createRng(21) });

    assert.deepEqual(other.standings.map((standing) => standing.playerId), ["two", "one"]);
    assert.deepEqual(other.comparisons.at(-1)?.values.map((value) => value.value), [3, 1]);
  });

  it("ranks a served tie identically under both exhausted-draw policies", () => {
    // `"tie"` is §25's fallback for a pool that cannot serve the draw; a table the pool
    // serves must not be able to tell which policy was asked for.
    const under = (exhaustedDrawPolicy: "throw" | "tie") =>
      rankShowdown({ entries: identical(), rng: createRng(7), exhaustedDrawPolicy });

    assert.deepEqual(under("tie"), under("throw"));
  });
});

describe("rankShowdown — §21 with no valid word anywhere (STO-326)", () => {
  it("skips the word steps for two seats that both score 0, and draws instead", () => {
    const ranking = rankShowdown({
      entries: [entry("one", 0), entry("two", 1)],
      rng: createRng(17),
    });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.score, standing.decidedBy, standing.compared]),
      [
        ["one", 1, 0, "tile-draw", 4],
        ["two", 2, 0, "tile-draw", 1],
      ],
    );
    // The score step still compared — both seats on 0 — but the word steps had nothing to
    // read on either of them (§11), so they were not decisions and are not recorded.
    assert.deepEqual(ranking.comparisons.map((comparison) => comparison.step), ["final-score", "tile-draw"]);
  });

  it("settles three zero-score seats by repeated draws, adding up each round", () => {
    const ranking = rankShowdown({
      entries: [entry("one", 0), entry("two", 1), entry("three", 2)],
      rng: createRng(42),
    });

    assert.deepEqual(
      ranking.standings.map((standing) => [standing.playerId, standing.place, standing.decidedBy, standing.compared]),
      [
        ["one", 1, "tile-draw", 10],
        ["three", 2, "tile-draw", 8],
        ["two", 3, "tile-draw", 1],
      ],
    );
    // All three drew; the two left sharing the highest total drew again; one of them took
    // the hand on the round after that.
    assert.deepEqual(
      ranking.comparisons.map((comparison) => [comparison.step, comparison.round]),
      [
        ["final-score", 1],
        ["tile-draw", 1],
        ["tile-draw", 2],
        ["tile-draw", 3],
      ],
    );
  });
});

describe("rankShowdown — the exhausted-draw fallback (§25)", () => {
  /** More tied seats than the draw pool can serve: the one field the pool cannot reach. */
  const tooMany = (): ShowdownEntry[] =>
    Array.from({ length: TILE_BAG_SIZE + 1 }, (_, seat) => entry(`seat-${seat}`, seat));

  it("shares one place among the still-tied seats instead of throwing", () => {
    const ranking = rankShowdown({ entries: tooMany(), rng: createRng(5), exhaustedDrawPolicy: "tie" });

    assert.equal(ranking.standings.length, TILE_BAG_SIZE + 1);
    assert.ok(ranking.standings.every((standing) => standing.place === 1));
    assert.ok(
      ranking.standings.every((standing) => standing.decidedBy === "tile-draw" && standing.compared === null),
    );
    // The pool could not serve a single round, so no draw round is recorded as a decision.
    assert.ok(ranking.comparisons.every((comparison) => comparison.step !== "tile-draw"));
  });

  it("still refuses the field under the default policy", () => {
    assert.throws(
      () => rankShowdown({ entries: tooMany(), rng: createRng(5) }),
      (error: unknown) => error instanceof DrawPoolExhaustedError,
    );
  });
});

describe("showdownDrawPool — §21.3's draw pool", () => {
  it("is §6's single-letter bag, with no two-letter tile in it", () => {
    const pool = showdownDrawPool();

    assert.ok(pool.every((tile) => !("alternativeLetter" in tile)), "the pool holds a two-letter tile");
    // §6's distribution: 98 single-letter copies across A–Z, and nothing else.
    assert.equal(pool.length, 98);
  });
});

describe("showdownDrawValue — what a drawn tile is worth (§21.3)", () => {
  it("reads a single letter's points, and both faces of a two-letter tile the wire can carry", () => {
    assert.equal(showdownDrawValue({ id: "Q-1", letter: "Q", points: 10 }), 10);
    assert.equal(
      showdownDrawValue({ id: "AE-1", letter: "A", points: 1, alternativeLetter: "E", alternativePoints: 1 }),
      2,
    );
  });
});
