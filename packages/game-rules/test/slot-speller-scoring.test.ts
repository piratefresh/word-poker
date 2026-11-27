import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSlotRun, evaluateSlotGrid, loadDictionary, spin, type SlotPowerCounts } from "../src/index";
import { testDictionary } from "./fixtures";
import { fixedRun } from "./slot-speller-fixtures";

/** Evaluates a fixed grid whose first row is `top` and whose other rows spell nothing. */
function payTop(top: string | readonly string[], words: readonly string[], powers: SlotPowerCounts = {}) {
  const filler = "V".repeat(top.length);
  return evaluateSlotGrid(fixedRun([top, filler, filler], powers), testDictionary(words));
}

describe("Slot Speller word scoring", () => {
  it("pays a 3-letter word half and a 4-letter word in full", () => {
    const three = payTop("PIGVV", ["PIG"]);
    assert.equal(three.total, 4);
    assert.equal(three.words[0]?.breakdown.lengthMult, 0.5);
    assert.equal(three.words[0]?.line, "Row 1");
    assert.deepEqual(three.words[0]?.cells, [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    assert.equal(payTop("PIGSV", ["PIGS"]).total, 10);
  });

  it("applies Double and Triple Letter tiles on a line", () => {
    const result = payTop(["C3", "A2", "T", "V", "V"], ["CAT"]);
    const word = result.words[0];
    assert.equal(word?.breakdown.base, 4 * 3 + 1 * 2 + 2);
    assert.equal(word?.breakdown.score, 8);
    assert.deepEqual(word?.breakdown.notes, ["TL C 4×3", "DL A 1×2"]);
  });

  it("chooses the best set of non-overlapping words on a line", () => {
    const pair = payTop("CATDOG", ["CAT", "DOG", "ATD", "TDO"]);
    assert.deepEqual(pair.words.map((w) => w.word), ["CAT", "DOG"]);
    assert.equal(pair.total, 8);
    const long = payTop("CATDOG", ["CAT", "DOG", "CATDOG"]);
    assert.deepEqual(long.words.map((w) => w.word), ["CATDOG"]);
    assert.equal(long.total, 21);
  });

  it("lets a blank play any letter for 0, up to two per word", () => {
    const one = payTop(["C", "?", "T", "V", "V"], ["CAT"]);
    assert.deepEqual(one.words[0]?.faces, ["C", "A", "T"]);
    assert.equal(one.words[0]?.breakdown.base, 6);
    assert.equal(one.total, 3);
    assert.deepEqual(one.words[0]?.breakdown.notes, ["? as A"]);
    assert.equal(payTop(["?", "?", "T", "V", "V"], ["CAT"]).total, 1);
    assert.equal(payTop(["?", "?", "?", "V", "V"], ["CAT"]).words.length, 0);
  });

  it("plays a choice tile as its better face", () => {
    const result = payTop(["K/Q", "A", "T", "V", "V"], ["KAT", "QAT"]);
    assert.equal(result.words[0]?.word, "QAT");
    assert.deepEqual(result.words[0]?.breakdown.notes, ["K/Q as Q"]);
    assert.equal(result.total, 7);
    assert.equal(payTop(["K/Q", "A", "T", "V", "V"], ["KAT"]).words[0]?.word, "KAT");
  });

  it("finds the same words without the prefix accelerator", () => {
    const full = testDictionary(["CAT", "CATS"]);
    const { hasPrefix: _accelerator, ...noPrefix } = full;
    const run = fixedRun([["C", "?", "T", "?", "V"], "VVVVV", "VVVVV"]);
    assert.deepEqual(evaluateSlotGrid(run, noPrefix), evaluateSlotGrid(run, full));
  });

  it("pays every line, including Wave and Zigzag shapes", () => {
    const run = { ...fixedRun(["CVCVC", "VAVAV", "VVVVV"], { zigzag: 1 }), zigzagPairs: [0] };
    const result = evaluateSlotGrid(run, testDictionary(["CAC"]));
    assert.deepEqual(result.words.map((w) => w.line), ["Zigzag 1-2"]);
  });
});

describe("Slot Speller Scoring powers", () => {
  it("Long Haul: ×2 at 6 letters, ×3 at 7+", () => {
    assert.equal(payTop("CATDOG", ["CATDOG"]).total, 21);
    assert.equal(payTop("CATDOG", ["CATDOG"], { longHaul: 1 }).total, 28);
    assert.equal(payTop("CATDOGS", ["CATDOGS"]).total, 32);
    const seven = payTop("CATDOGS", ["CATDOGS"], { longHaul: 1 });
    assert.equal(seven.total, 48);
    assert.equal(seven.words[0]?.breakdown.lengthMult, 3);
    assert.equal(payTop("PIGS", ["PIGS"], { longHaul: 1 }).total, 10);
  });

  it("Action: words ending ING or ED ×2", () => {
    assert.equal(payTop("BAKED", ["BAKED"]).total, 14);
    const result = payTop("BAKED", ["BAKED"], { action: 1 });
    assert.equal(result.total, 28);
    assert.deepEqual(result.words[0]?.breakdown.triggered, ["action"]);
    assert.equal(payTop("SINGV", ["SING"], { action: 1 }).total, 2 * (2 + 1 + 2 + 3));
  });

  it("Heavy: words with J, Q, X or Z ×2", () => {
    assert.equal(payTop("QUIZV", ["QUIZ"]).total, 22);
    assert.equal(payTop("QUIZV", ["QUIZ"], { heavy: 1 }).total, 44);
  });

  it("Twins: words with a double letter ×2", () => {
    assert.equal(payTop("BOOKV", ["BOOK"]).total, 11);
    const result = payTop("BOOKV", ["BOOK"], { twins: 1 });
    assert.equal(result.total, 22);
    assert.deepEqual(result.words[0]?.breakdown.triggered, ["twins"]);
  });

  it("stacks Scoring powers in rule order", () => {
    const result = payTop("JAZZED", ["JAZZED"], { action: 1, heavy: 1, twins: 1 });
    assert.deepEqual(result.words[0]?.breakdown.triggered, ["action", "heavy", "twins"]);
    assert.equal(result.total, Math.round(33 * 1.5 * 8));
  });
});

describe("Slot Speller evaluation speed", () => {
  it("evaluates a 12×5 grid with blanks and every line against the full dictionary", async () => {
    const dictionary = await loadDictionary();
    const config = { ...createSlotRun("speed").config, reels: 12, rows: 5 };
    const run = spin({ ...createSlotRun("speed", config), powers: { wave: 1, zigzag: 4 }, zigzagPairs: [0, 1, 2, 3] });
    assert.equal(run.ok, true);
    const grid = run.state.grid.map((column, reel) =>
      column.map((t, row) => ((reel + row) % 5 === 0 ? { id: t.id, letter: "?", points: 0 as const, blank: true as const } : t)),
    );
    const started = performance.now();
    const result = evaluateSlotGrid({ ...run.state, grid }, dictionary);
    const elapsed = performance.now() - started;
    assert.ok(result.words.length > 0);
    assert.ok(elapsed < 2000, `took ${elapsed}ms`);
  });
});
