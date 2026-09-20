import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import { resolveSubmission } from "../src/building";
import { dealHand } from "../src/deal";
import type { Dictionary } from "../src/dictionary";
import { LETTER_VALUES, type Letter } from "../src/letters";
import { evaluateBestWord } from "../src/word-search";
import { testDictionary } from "./fixtures";

/** A single-letter tile as the bag prints it. */
function letter(face: Letter, copy = 1): Tile {
  return { id: `${face}-${copy}`, letter: face, points: LETTER_VALUES[face] };
}

/** A choice tile: one physical tile, two faces, either of them playable (§10). */
function choice(first: Letter, second: Letter): Tile {
  return {
    id: `${first}${second}-1`,
    letter: first,
    points: LETTER_VALUES[first],
    alternativeLetter: second,
    alternativePoints: LETTER_VALUES[second],
  };
}

/** A fixed-sequence tile: both faces, in printed order, on one physical tile (§10). */
function sequence(first: Letter, second: Letter): Tile {
  return {
    id: `${first}${second}-seq-1`,
    letter: first,
    points: LETTER_VALUES[first],
    sequenceLetter: second,
    sequencePoints: LETTER_VALUES[second],
  };
}

/**
 * The walk as it stood before STO-361: every order of every subset, each one scored by
 * rebuilding §7 from the plays. Slower by a factor of fifty and, being exhaustive, exactly
 * what the pruned walk has to agree with.
 */
function exhaustive(available: readonly Tile[], dictionary: Dictionary): { word: string; score: number } | null {
  const played: TilePlay[] = [];
  const used = new Set<string>();
  let best: { word: string; score: number } | null = null;

  const consider = (): void => {
    if (played.length === 0) return;
    const submission: WordSubmission = { plays: [...played] };
    const resolution = resolveSubmission({ available, submission });
    if (!resolution.ok || !dictionary.isWord(resolution.word)) return;

    let score = 0;
    for (const tile of resolution.tiles) {
      const factor = tile.multiplier === "double-letter" ? 2 : tile.multiplier === "triple-letter" ? 3 : 1;
      for (const { points } of tile.letters) score += points * factor;
    }
    if (resolution.tiles.length === 7) score += 10;

    const candidate = { word: resolution.word, score };
    if (
      best === null ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        (candidate.word.length > best.word.length ||
          (candidate.word.length === best.word.length && candidate.word < best.word)))
    ) {
      best = candidate;
    }
  };

  const visit = (): { word: string; score: number } | null => {
    consider();
    for (const tile of available) {
      if (used.has(tile.id)) continue;
      for (const play of "alternativeLetter" in tile
        ? [
            { tileId: tile.id, chosenFace: tile.letter },
            { tileId: tile.id, chosenFace: tile.alternativeLetter },
          ]
        : [{ tileId: tile.id }]) {
        used.add(tile.id);
        played.push(play);
        visit();
        played.pop();
        used.delete(tile.id);
      }
    }
    return best;
  };

  return visit();
}

describe("evaluateBestWord", () => {
  it("returns the same word for the same tiles and dictionary", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];
    const dictionary = testDictionary(["CAT", "CATS", "ACTS", "AS"]);

    assert.deepEqual(
      evaluateBestWord({ available, dictionary }),
      evaluateBestWord({ available, dictionary }),
    );
  });

  it("prefers §7's score, then §21.1's letter count, then the word itself", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];
    const dictionary = testDictionary(["AS", "SAT", "CAT", "CATS", "ACTS", "CAST", "SCAT"]);

    // Four four-letter words tie on §7's score; §21.1 ties again; the alphabet settles it.
    assert.equal(evaluateBestWord({ available, dictionary })?.word, "ACTS");
  });

  it("tries both faces of a choice tile", () => {
    const available = [choice("A", "E"), letter("T"), letter("S")];

    // SET is worth more than either two-letter word, and it is only spellable on the E face.
    assert.equal(evaluateBestWord({ available, dictionary: testDictionary(["AT", "ET", "SET"]) })?.word, "SET");
  });

  it("plays a fixed-sequence tile as both of its letters, in order", () => {
    const available = [sequence("T", "H"), letter("E"), letter("R"), letter("E", 2)];

    // THERE and THREE tie on both score and length, so the alphabet decides.
    assert.equal(
      evaluateBestWord({ available, dictionary: testDictionary(["HER", "THERE", "THREE"]) })?.word,
      "THERE",
    );
  });

  it("plays every physical tile at most once", () => {
    const one = [letter("A")];
    const two = [letter("A"), letter("B")];
    const dictionary = testDictionary(["AB", "AAB", "AA"]);

    assert.equal(evaluateBestWord({ available: two, dictionary })?.word, "AB");
    assert.equal(evaluateBestWord({ available: one, dictionary }), null);
  });

  it("plays the whole rack when the bonus makes it worth it", () => {
    const available: Tile[] = ["A", "B", "C", "D", "E", "F", "G"].map((face) => letter(face as Letter));

    // 21 points of letters plus §7.3's +10 for playing all seven; AB would score 5.
    const found = evaluateBestWord({ available, dictionary: testDictionary(["AB", "ABCDEFG"]) });

    assert.equal(found?.word, "ABCDEFG");
    assert.equal(found?.score.total, 31);
    assert.equal(found?.score.fullRackBonus, 10);
  });

  it("returns no word when the tiles spell nothing the table counts", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];

    assert.equal(evaluateBestWord({ available, dictionary: testDictionary(["STRONG"]) }), null);
    assert.equal(evaluateBestWord({ available, dictionary: testDictionary([]) }), null);
    assert.equal(evaluateBestWord({ available: [], dictionary: testDictionary(["CAT"]) }), null);
  });

  it("reports §7's breakdown for the word it picked, not a total assembled elsewhere", () => {
    const available = [letter("M"), letter("O"), letter("N"), letter("S"), letter("T"), letter("E"), letter("R")];
    const found = evaluateBestWord({ available, dictionary: testDictionary(["MONSTER", "STONE"]) });

    assert.equal(found?.word, "MONSTER");
    // §6: M4 + O1 + N2 + S2 + T2 + E1 + R2, with no multiplier on any of them.
    assert.equal(found?.score.letterScore, 14);
    assert.equal(found?.score.total, 24, "every physical tile played, so §7.3 adds its 10");
    assert.equal(found?.score.letters.map((one) => one.letter).join(""), "MONSTER");
  });

  /**
   * The property the pruned walk is built on: skipping a prefix no dictionary word extends
   * cannot change the answer, because every word is a prefix of itself. A bug in the prune —
   * an off-by-one in the binary search, a prefix tested before the letters are appended —
   * shows up here as a rack where the two walks disagree, and nowhere else.
   */
  it("answers what an exhaustive walk answers, on the racks a deal produces", () => {
    const dictionary = testDictionary(["AA", "QI", "STRONG", "MONSTER"]);

    for (let seed = 1; seed <= 40; seed += 1) {
      const deal = dealHand({ seed, playerCount: 4 });
      const available = [...(deal.privateTiles[0] ?? []), ...deal.community];
      const expected = exhaustive(available, dictionary);
      const found = evaluateBestWord({ available, dictionary });

      assert.equal(found?.word ?? null, expected?.word ?? null, `seed ${seed} agreed on the word`);
      assert.equal(found?.score.total ?? null, expected?.score ?? null, `seed ${seed} agreed on the score`);
    }
  });

  it("agrees with the exhaustive walk on multipliers, choice tiles and duplicate faces too", () => {
    // Racks a deal can make but a seed sweep rarely lands on: three tiles of one face, both
    // faces of a choice tile, a sequence tile, and §9's multipliers on them.
    const racks: readonly (readonly Tile[])[] = [
      [letter("A", 1), letter("A", 2), letter("A", 3), letter("B", 1)],
      [choice("A", "E"), choice("T", "S"), letter("B", 1), letter("R", 1)],
      [sequence("T", "H"), sequence("E", "R"), letter("E", 1), letter("D", 1)],
      [{ ...letter("A"), multiplier: "triple-letter" as const }, letter("B"), letter("S")],
      [{ ...letter("Q"), multiplier: "double-letter" as const }, letter("I"), letter("T")],
      [letter("M"), letter("O"), letter("N"), letter("S"), letter("T"), letter("E"), letter("R")],
    ];
    const dictionary = testDictionary([
      "AA", "AAA", "AB", "ABET", "BAR", "BAT", "BATS", "BE", "BEST", "BET", "QI", "QIS", "THERE", "MONSTER", "STONE",
    ]);

    for (const available of racks) {
      const found = evaluateBestWord({ available, dictionary });
      const expected = exhaustive(available, dictionary);
      const rack = available.map((tile) => tile.id).join(",");

      assert.equal(found?.word ?? null, expected?.word ?? null, `agreed on the word for ${rack}`);
      assert.equal(found?.score.total ?? null, expected?.score ?? null, `agreed on the score for ${rack}`);
    }
  });

  it("keeps the answer when the rack arrives in a different order", () => {
    const dictionary = testDictionary(["CAT", "CATS", "ACTS", "AS", "CAST", "SCAT"]);
    const rack = [letter("C"), letter("A"), letter("T"), letter("S")];

    const forward = evaluateBestWord({ available: rack, dictionary });
    const backward = evaluateBestWord({ available: [...rack].reverse(), dictionary });

    assert.equal(forward?.word, backward?.word);
  });

  it("remembers a rack it has already searched, and answers the same", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];
    const dictionary = testDictionary(["AS", "SAT", "CAT", "CATS", "ACTS"]);
    const first = evaluateBestWord({ available, dictionary });

    // A fresh dictionary object is a different list to the memo even with the same words, and
    // a second ask of the same one must land on what the walk found the first time.
    assert.deepEqual(evaluateBestWord({ available, dictionary }), first);
    assert.deepEqual(evaluateBestWord({ available: [...available], dictionary }), first);
  });

  it("is not confused by tiles that print the same letters but carry different multipliers", () => {
    const dictionary = testDictionary(["AB"]);
    const plain = [letter("A"), letter("B")];
    const doubled = [{ ...letter("A"), multiplier: "double-letter" as const }, letter("B")];

    assert.equal(evaluateBestWord({ available: plain, dictionary })?.score.total, 5);
    assert.equal(evaluateBestWord({ available: doubled, dictionary })?.score.total, 6);
  });
});
