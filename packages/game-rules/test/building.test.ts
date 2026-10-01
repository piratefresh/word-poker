import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, WordEvaluation, WordSubmission } from "@wordpoker/contracts";

import { evaluateWord, spellSubmission } from "../src/words/building";
import { DICTIONARIES, createDictionary, loadDictionary, type Dictionary } from "../src/words/dictionary";

/**
 * A dictionary of the words these tests spell. `createDictionary` refuses an artifact whose
 * label disagrees with the shipped name, so the fake is built the way the real one is — the
 * only difference is that its word list is short enough to reason about.
 */
function dictionaryOf(...words: string[]): Dictionary {
  const sorted = [...words].sort();
  return createDictionary({
    id: "en_US-large",
    label: DICTIONARIES["en_US-large"].label,
    source: { file: "test-fixture.txt", sha256: "0".repeat(64), lines: sorted.length },
    count: sorted.length,
    words: sorted,
  });
}

const SINGLE = {
  m: { id: "M-1", letter: "M", points: 4 },
  a: { id: "A-1", letter: "A", points: 1 },
  r: { id: "R-1", letter: "R", points: 2 },
  k: { id: "K-1", letter: "K", points: 5 },
  e: { id: "E-1", letter: "E", points: 1 },
  t: { id: "T-1", letter: "T", points: 2 },
  o: { id: "O-1", letter: "O", points: 1 },
  w: { id: "W-1", letter: "W", points: 5 },
  n: { id: "N-1", letter: "N", points: 2 },
  s: { id: "S-1", letter: "S", points: 2 },
} satisfies Record<string, Tile>;

/** The bag's A/E choice tile, both faces equal-valued. */
const A_E: Tile = { id: "AE-1", letter: "A", points: 1, alternativeLetter: "E", alternativePoints: 1 };

/** A choice pair whose faces are worth different amounts — the reason `alternativePoints` exists. */
const Q_K: Tile = { id: "QK-1", letter: "Q", points: 10, alternativeLetter: "K", alternativePoints: 5 };

function play(tile: Tile, chosenFace?: string): { tileId: string; chosenFace?: string } {
  return chosenFace === undefined ? { tileId: tile.id } : { tileId: tile.id, chosenFace };
}

/** The §11 reason a submission was refused, failing the test if it was accepted instead. */
function refusal(evaluation: WordEvaluation): string {
  assert.ok(!evaluation.valid, `expected a refusal, received ${JSON.stringify(evaluation)}`);
  return evaluation.reason;
}

describe("spellSubmission — the letters typed so far", () => {
  it("spells a draft §12 will not call a word yet", () => {
    const available = [SINGLE.m, SINGLE.a];

    assert.equal(spellSubmission({ available, submission: { plays: [play(SINGLE.m)] } }), "M");
    assert.equal(
      spellSubmission({ available, submission: { plays: [play(SINGLE.m), play(SINGLE.a)] } }),
      "MA",
    );
  });

  it("spells a choice tile as the face it played, and a plain tile as its letter", () => {
    const available = [SINGLE.t, A_E, Q_K];

    assert.equal(spellSubmission({ available, submission: { plays: [play(SINGLE.t)] } }), "T");
    assert.equal(spellSubmission({ available, submission: { plays: [play(A_E, "E")] } }), "E");
    assert.equal(spellSubmission({ available, submission: { plays: [play(Q_K, "K")] } }), "K");
  });

  it("spells nothing for a play the seat cannot name", () => {
    const available = [SINGLE.m];

    assert.equal(spellSubmission({ available, submission: { plays: [{ tileId: "Z-9" }] } }), "");
    assert.equal(spellSubmission({ available, submission: { plays: [] } }), "");
    // A face the tile does not print contributes nothing rather than guessing one.
    assert.equal(spellSubmission({ available, submission: { plays: [play(SINGLE.m, "Z")] } }), "");
  });
});

describe("evaluateWord — accepted words", () => {
  it("spells the word from the played tiles and resolves every letter back to its tile", () => {
    const available = [SINGLE.m, SINGLE.a, SINGLE.r, SINGLE.k, SINGLE.e, SINGLE.t, SINGLE.o];
    const submission: WordSubmission = {
      plays: [
        play(SINGLE.m),
        play(SINGLE.a),
        play(SINGLE.r),
        play(SINGLE.k),
        play(SINGLE.e),
        play(SINGLE.t),
      ],
    };

    const evaluation = evaluateWord({ available, submission, dictionary: dictionaryOf("MARKET", "TO") });

    assert.ok(evaluation.valid);
    assert.equal(evaluation.word, "MARKET");
    assert.equal(evaluation.dictionary, "en_US-large");
    assert.deepEqual(
      evaluation.tiles.map((tile) => [tile.tileId, tile.letters.map((letter) => letter.letter)]),
      [
        ["M-1", ["M"]],
        ["A-1", ["A"]],
        ["R-1", ["R"]],
        ["K-1", ["K"]],
        ["E-1", ["E"]],
        ["T-1", ["T"]],
      ],
    );
    // Six physical tiles of the seven on the felt: §7's Full Rack Bonus is scoring's call,
    // and it needs the count, which the resolution gives it.
    assert.equal(evaluation.tiles.length, 6);
  });

  it("checks the word against the dictionary it was handed, not a list of its own", () => {
    const available = [SINGLE.t, SINGLE.o];
    const submission: WordSubmission = { plays: [play(SINGLE.t), play(SINGLE.o)] };

    assert.ok(evaluateWord({ available, submission, dictionary: dictionaryOf("TO") }).valid);
    assert.equal(
      refusal(evaluateWord({ available, submission, dictionary: dictionaryOf("TWO") })),
      "not-in-dictionary",
    );
  });

  it("validates a word the real configured list holds", async () => {
    const dictionary = await loadDictionary();
    const available = [SINGLE.m, SINGLE.a, SINGLE.r, SINGLE.k, SINGLE.e, SINGLE.t];

    const evaluation = evaluateWord({
      available,
      submission: { plays: available.map((tile) => play(tile)) },
      dictionary,
    });

    assert.ok(evaluation.valid);
    assert.equal(evaluation.word, "MARKET");
  });
});

describe("evaluateWord — choice tiles (§10)", () => {
  it("plays the chosen face alone, and records that face", () => {
    // Only the E face spells TEN; the A face would spell TAN.
    const available = [SINGLE.t, A_E, SINGLE.n];
    const submission: WordSubmission = { plays: [play(SINGLE.t), play(A_E, "E"), play(SINGLE.n)] };

    const evaluation = evaluateWord({ available, submission, dictionary: dictionaryOf("TEN", "TAN") });

    assert.ok(evaluation.valid);
    assert.equal(evaluation.word, "TEN");
    assert.deepEqual(evaluation.tiles[1]?.letters, [{ letter: "E", points: 1 }]);
  });

  it("refuses a face the tile does not print, and both faces at once", () => {
    const available = [SINGLE.t, A_E, SINGLE.n];
    const dictionary = dictionaryOf("TEN");

    for (const face of ["A/E", "AE", "X", ""]) {
      const submission: WordSubmission = {
        plays: [play(SINGLE.t), play(A_E, face), play(SINGLE.n)],
      };
      assert.equal(
        refusal(evaluateWord({ available, submission, dictionary })),
        "uses-unavailable-letters",
        `face ${JSON.stringify(face)}`,
      );
    }
  });

  it("refuses a choice tile that names no face, rather than guessing one", () => {
    const available = [SINGLE.t, A_E, SINGLE.n];
    const submission: WordSubmission = { plays: [play(SINGLE.t), play(A_E), play(SINGLE.n)] };

    assert.equal(
      refusal(evaluateWord({ available, submission, dictionary: dictionaryOf("TEN") })),
      "uses-unavailable-letters",
    );
  });

  it("scores the face that was played when the two faces differ", () => {
    // §6: a choice pair's faces need not be worth the same, so the played face's own value
    // is what the resolution carries into scoring — K here, not Q's 10.
    const available = [Q_K, SINGLE.a];

    const asKing = evaluateWord({
      available,
      submission: { plays: [play(Q_K, "K"), play(SINGLE.a)] },
      dictionary: dictionaryOf("KA"),
    });

    assert.ok(asKing.valid);
    assert.equal(asKing.word, "KA");
    assert.deepEqual(asKing.tiles[0], { tileId: "QK-1", letters: [{ letter: "K", points: 5 }] });

    const asQueen = evaluateWord({
      available: [Q_K, SINGLE.a],
      submission: { plays: [play(Q_K, "Q"), play(SINGLE.a)] },
      dictionary: dictionaryOf("QA"),
    });

    assert.ok(asQueen.valid);
    assert.equal(asQueen.word, "QA");
    assert.deepEqual(asQueen.tiles[0], { tileId: "QK-1", letters: [{ letter: "Q", points: 10 }] });
  });
});

describe("evaluateWord — refusals (§11)", () => {
  it("refuses an empty submission before anything else", () => {
    assert.equal(
      refusal(evaluateWord({ available: [], submission: { plays: [] }, dictionary: dictionaryOf("TO") })),
      "empty-submission",
    );
  });

  it("refuses a word of fewer than two letters (§12)", () => {
    assert.equal(
      refusal(
        evaluateWord({
          available: [SINGLE.t],
          submission: { plays: [play(SINGLE.t)] },
          dictionary: dictionaryOf("T"),
        }),
      ),
      "too-short",
    );
  });

  it("refuses a tile the seat does not hold", () => {
    assert.equal(
      refusal(
        evaluateWord({
          available: [SINGLE.t],
          submission: { plays: [play(SINGLE.t), play(SINGLE.o)] },
          dictionary: dictionaryOf("TO"),
        }),
      ),
      "uses-unavailable-letters",
    );
  });

  it("refuses the same physical tile twice", () => {
    assert.equal(
      refusal(
        evaluateWord({
          available: [SINGLE.t, SINGLE.o],
          submission: { plays: [play(SINGLE.t), play(SINGLE.o), play(SINGLE.t)] },
          dictionary: dictionaryOf("TOT"),
        }),
      ),
      "tile-reused",
    );
  });

  it("refuses a play that asks a single-letter tile to be something else", () => {
    assert.equal(
      refusal(
        evaluateWord({
          available: [SINGLE.t, SINGLE.o],
          submission: { plays: [play(SINGLE.t, "O"), play(SINGLE.o)] },
          dictionary: dictionaryOf("TO"),
        }),
      ),
      "uses-unavailable-letters",
    );
  });

  it("accepts §12's seven-letter limit and refuses the eighth letter by name", () => {
    // Every tile, choice tiles included, plays exactly one letter (§10), so the ceiling is a
    // word-length rule and not a property of the felt: a caller that hands over more tiles
    // than a table deals still gets the word refused rather than accepted for being buildable.
    const seven = [SINGLE.w, SINGLE.o, SINGLE.r, SINGLE.k, SINGLE.m, SINGLE.a, SINGLE.t];
    const sevenPlays: WordSubmission = { plays: seven.map((tile) => play(tile)) };

    const atLimit = evaluateWord({ available: seven, submission: sevenPlays, dictionary: dictionaryOf("WORKMAT") });

    assert.ok(atLimit.valid);
    assert.equal(atLimit.word.length, 7);

    const eight = [...seven, SINGLE.e];
    const eightPlays: WordSubmission = { plays: eight.map((tile) => play(tile)) };

    assert.equal(
      refusal(evaluateWord({ available: eight, submission: eightPlays, dictionary: dictionaryOf("WORKMATE") })),
      "too-long",
    );
  });
});
