import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, TilePlayResolution } from "@wordpoker/contracts";

import { scoreWord } from "../src/scoring";

/**
 * Builds a tile the way the bag deals one: a single letter, or — when a second face is
 * given — the choice tile shape `@wordpoker/contracts` pins, with both faces valued.
 */
function tile(letter: string, points: number, alternativeLetter?: string): Tile {
  if (alternativeLetter === undefined) {
    return { id: letter, letter, points };
  }
  return {
    id: `${letter}/${alternativeLetter}`,
    letter,
    points,
    alternativeLetter,
    alternativePoints: points,
  };
}

/** The shape the build step hands to scoring: a tile's letters, each with its own value. */
function played(
  tileId: string,
  letters: readonly (readonly [letter: string, points: number])[],
  multiplier?: "double-letter" | "triple-letter",
): TilePlayResolution {
  return {
    tileId,
    letters: letters.map(([letter, points]) => ({ letter, points })),
    ...(multiplier === undefined ? {} : { multiplier }),
  };
}

/** §7's six-tile example: M4 A1 R2 K5 E1 T2. */
function market(): TilePlayResolution[] {
  return [
    played("M-1", [["M", 4]]),
    played("A-1", [["A", 1]]),
    played("R-1", [["R", 2]]),
    played("K-1", [["K", 5]]),
    played("E-1", [["E", 1]]),
    played("T-1", [["T", 2]]),
  ];
}

describe("scoreWord — §7 step 1: letter values", () => {
  it("adds MARKET's letters to the 15 points §7 works through", () => {
    const score = scoreWord(market());

    assert.equal(score.letterScore, 15);
    assert.equal(score.fullRackBonus, 0);
    assert.equal(score.total, 15);
    assert.deepEqual(
      score.letters.map((letter) => [letter.letter, letter.value]),
      [
        ["M", 4],
        ["A", 1],
        ["R", 2],
        ["K", 5],
        ["E", 1],
        ["T", 2],
      ],
    );
  });

  it("scores a sequence tile's two letters independently", () => {
    // TH prints T (2) and H (5): the tile is worth both letters, not one of them doubled.
    const score = scoreWord([played("TH-1", [["T", 2], ["H", 5]])]);

    assert.equal(score.letterScore, 7);
    assert.deepEqual(score.letters.map((letter) => letter.letter), ["T", "H"]);
  });

  it("scores only the face a choice tile played", () => {
    // The two faces of a Q/K pair are not equal: playing the K carries K's 5, and the Q's
    // 10 is never on this word to score.
    const score = scoreWord([played("QK-1", [["K", 5]])]);

    assert.equal(score.letterScore, 5);
    assert.deepEqual(score.letters, [{ letter: "K", baseValue: 5, value: 5 }]);
  });
});

describe("scoreWord — §7 step 2: multipliers", () => {
  it("doubles a Double Letter M the way §7's example does", () => {
    const score = scoreWord([played("M-1", [["M", 4]], "double-letter")]);

    assert.deepEqual(score.letters, [
      { letter: "M", baseValue: 4, multiplier: "double-letter", value: 8 },
    ]);
    assert.equal(score.letterScore, 8);
  });

  it("triples a Triple Letter Q", () => {
    const score = scoreWord([played("Q-1", [["Q", 10]], "triple-letter")]);

    assert.equal(score.letterScore, 30);
    assert.deepEqual(score.letters, [
      { letter: "Q", baseValue: 10, multiplier: "triple-letter", value: 30 },
    ]);
  });

  it("applies the multiplier to every letter a sequence tile prints", () => {
    // §9: the multiplier belongs to the physical tile, so both of TH's faces carry it.
    const score = scoreWord([played("TH-1", [["T", 2], ["H", 5]], "double-letter")]);

    assert.equal(score.letterScore, 14);
    assert.deepEqual(score.letters.map((letter) => letter.value), [4, 10]);
  });

  it("leaves a tile without a multiplier at its printed value", () => {
    const score = scoreWord([played("M-1", [["M", 4]])]);

    assert.equal(score.letterScore, 4);
    assert.ok(!("multiplier" in (score.letters[0] ?? {})));
  });
});

describe("scoreWord — §7 step 3: the Full Rack Bonus", () => {
  it("reproduces §8's MONSTER example: 14 base, Double Letter M → 18, full rack → 28", () => {
    const score = scoreWord([
      played("M-1", [["M", 4]], "double-letter"),
      played("O-1", [["O", 1]]),
      played("N-1", [["N", 2]]),
      played("S-1", [["S", 2]]),
      played("T-1", [["T", 2]]),
      played("E-1", [["E", 1]]),
      played("R-1", [["R", 2]]),
    ]);

    const base = score.letters.reduce((total, letter) => total + letter.baseValue, 0);
    assert.equal(base, 14);
    assert.equal(score.letterScore, 18);
    assert.equal(score.fullRackBonus, 10);
    assert.equal(score.total, 28);
  });

  it("counts physical tiles, not letters, in both directions", () => {
    // Seven tiles printing eight letters: TH is one tile, so the rack is complete.
    const sevenTiles = scoreWord([
      played("TH-1", [["T", 2], ["H", 5]]),
      played("A-1", [["A", 1]]),
      played("W-1", [["W", 5]]),
      played("O-1", [["O", 1]]),
      played("E-1", [["E", 1]]),
      played("R-1", [["R", 2]]),
      played("S-1", [["S", 2]]),
    ]);

    assert.equal(sevenTiles.letters.length, 8);
    assert.equal(sevenTiles.fullRackBonus, 10);

    // Six tiles printing seven letters: one tile left behind costs the bonus.
    const sixTiles = scoreWord([
      played("TH-1", [["T", 2], ["H", 5]]),
      played("A-1", [["A", 1]]),
      played("W-1", [["W", 5]]),
      played("O-1", [["O", 1]]),
      played("E-1", [["E", 1]]),
      played("R-1", [["R", 2]]),
    ]);

    assert.equal(sixTiles.letters.length, 7);
    assert.equal(sixTiles.fullRackBonus, 0);
  });
});

describe("scoreWord — the breakdown adds up", () => {
  it("sums its letters to the modified score, and modified plus bonus to the total", () => {
    const score = scoreWord([
      played("M-1", [["M", 4]], "double-letter"),
      played("O-1", [["O", 1]]),
      played("N-1", [["N", 2]]),
      played("S-1", [["S", 2]]),
      played("T-1", [["T", 2]]),
      played("E-1", [["E", 1]]),
      played("R-1", [["R", 2]]),
    ]);

    const summed = score.letters.reduce((total, letter) => total + letter.value, 0);
    assert.equal(summed, score.letterScore);
    assert.equal(score.letterScore + score.fullRackBonus, score.total);
  });

  it("scores nothing for a word of no tiles", () => {
    assert.deepEqual(scoreWord([]), { letters: [], letterScore: 0, fullRackBonus: 0, total: 0 });
  });
});
