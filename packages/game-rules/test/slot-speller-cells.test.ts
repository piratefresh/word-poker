import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SLOT_SPELLER_CONFIG,
  createSlotRun,
  evaluateSlotGrid,
  patternCell,
  rollCells,
  spin,
  swap,
  type SlotPremiumCell,
  type SlotSpellerConfig,
  type SlotSpellerState,
} from "../src/index";
import { testDictionary } from "./fixtures";
import { fixedRun, premium } from "./slot-speller-fixtures";

const CONFIG = DEFAULT_SLOT_SPELLER_CONFIG;
const FIXED: SlotSpellerConfig = { ...CONFIG, cells: { ...CONFIG.cells, moving: false } };

/** The pattern over a `reels` × `rows` grid, one string per row: `2L`, `3W`, … or `..`. */
function board(reels: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: reels }, (_, reel) => {
      const cell = patternCell(CONFIG, reel, row);
      return cell === null ? ".." : `${cell.multiplier}${cell.kind === "word" ? "W" : "L"}`;
    }).join(" "),
  );
}

/** Each row's cells as sorted `2L`-style specs: what a row holds, wherever it landed. */
function perRow(cells: readonly SlotPremiumCell[], rows: number): string[][] {
  return Array.from({ length: rows }, (_, row) =>
    cells
      .filter((cell) => cell.row === row)
      .map((cell) => `${cell.multiplier}${cell.kind === "word" ? "W" : "L"}`)
      .sort(),
  );
}

function spun(state: SlotSpellerState): SlotSpellerState {
  const result = spin(state);
  assert.ok(result.ok);
  return result.state;
}

describe("Slot Speller premium cells", () => {
  it("draws 2L, 2W, 2L on the starting 5 × 3 grid", () => {
    assert.deepEqual(board(5, 3), [".. 2L .. .. ..", ".. .. 2W .. ..", ".. .. .. 2L .."]);
  });

  it("draws the full 12 × 5 board", () => {
    assert.deepEqual(board(12, 5), [
      ".. 2L .. .. .. 3L .. .. .. 2L .. ..",
      ".. .. 2W .. .. .. 2W .. .. .. 3W ..",
      ".. .. .. 2L .. .. .. 3L .. .. .. 2L",
      "2W .. .. .. 2W .. .. .. 2W .. .. ..",
      ".. 3L .. .. .. 2L .. .. .. 3L .. ..",
    ]);
  });

  it("keeps the pattern's cells where it draws them when cells do not move", () => {
    const run = createSlotRun("cells", FIXED);
    assert.deepEqual(run.cells, [premium(1, 0, "2L"), premium(2, 1, "2W"), premium(3, 2, "2L")]);
    assert.deepEqual(spun(run).cells, run.cells);
  });

  it("lands each row's cells on reels of that row, the same for the same seed", () => {
    const run = createSlotRun("cells");
    assert.deepEqual(perRow(run.cells, 3), [["2L"], ["2W"], ["2L"]]);
    assert.deepEqual(createSlotRun("cells").cells, run.cells);

    const first = spun(run);
    assert.deepEqual(perRow(first.cells, 3), [["2L"], ["2W"], ["2L"]]);
    assert.deepEqual(spun(createSlotRun("cells")).cells, first.cells);
    const between: SlotSpellerState = { ...first, phase: "between" };
    assert.deepEqual(spun(JSON.parse(JSON.stringify(between)) as SlotSpellerState).cells, spun(between).cells);
  });

  it("moves the cells from spin to spin and leaves them alone in between", () => {
    let state = createSlotRun("cells", { ...CONFIG, spinsPerRound: 30 });
    const layouts = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      state = { ...spun(state), phase: "between" };
      layouts.add(JSON.stringify(state.cells));
    }
    assert.ok(layouts.size > 1);
    const moving = spun(createSlotRun("cells"));
    const swapped = swap(moving, [0, 0], [4, 0]);
    assert.deepEqual((swapped.ok ? swapped.state : moving).cells, moving.cells);
  });

  it("keeps a held reel's cells and moves the rest onto other reels", () => {
    const base = createSlotRun("cells", { ...CONFIG, reels: 9 });
    const cells = [premium(0, 0, "2L"), premium(8, 0, "3L"), premium(0, 1, "2W"), premium(1, 1, "2W"), premium(0, 2, "2L"), premium(1, 2, "3L")];
    for (let roll = 0; roll < 20; roll += 1) {
      const rolled = rollCells({ ...base, cells, holds: [0], cellRolls: roll }, 9, 3).cells;
      assert.deepEqual(perRow(rolled, 3), [["2L", "3L"], ["2W", "2W"], ["2L", "3L"]]);
      assert.deepEqual(rolled.filter((cell) => cell.reel === 0), [premium(0, 0, "2L"), premium(0, 1, "2W"), premium(0, 2, "2L")]);
    }
  });

  it("multiplies the tile on a letter cell and every word over a word cell", () => {
    const words = testDictionary(["CAT", "CATS"]);
    const filler = "VVVVV";
    const pay = (top: string | readonly string[], cells: readonly SlotPremiumCell[]) =>
      evaluateSlotGrid(fixedRun([top, filler, filler], {}, cells), words).words[0]?.breakdown;

    // C4 + A1×3L + T2 = 9 · ×½ length = 4.5 → 5
    const letter = pay("CATVV", [premium(1, 0, "3L")]);
    assert.deepEqual(letter?.letters, [
      { letter: "C", points: 4, tileMult: 1, cellMult: 1 },
      { letter: "A", points: 1, tileMult: 1, cellMult: 3 },
      { letter: "T", points: 2, tileMult: 1, cellMult: 1 },
    ]);
    assert.deepEqual([letter?.base, letter?.wordCells, letter?.lengthMult, letter?.exact, letter?.score], [9, [], 0.5, 4.5, 5]);

    // C4×2L + A1 + T2 + S2 = 13 · ×2W = 26
    const both = pay("CATSV", [premium(0, 0, "2L"), premium(3, 0, "2W")]);
    assert.deepEqual([both?.base, both?.wordCells, both?.score], [13, [2], 26]);

    // A cell the word does not cover, or one on another row, pays nothing.
    assert.equal(pay("CATVV", [premium(4, 0, "3W"), premium(0, 1, "3L")])?.score, 4);
  });

  it("multiplies two word cells under one word together", () => {
    const result = evaluateSlotGrid(
      fixedRun(["CATSV", "VVVVV", "VVVVV"], {}, [premium(0, 0, "2W"), premium(2, 0, "3W")]),
      testDictionary(["CATS"]),
    );
    assert.deepEqual(result.words[0]?.breakdown.wordCells, [2, 3]);
    assert.equal(result.total, 54);
  });

  it("applies cells before the length multiplier and the powers", () => {
    // (J8×2L + A1 + Z10 + Z10) = 37 · ×2W · ×1 · Heavy ×2 · Twins ×2 = 296
    const result = evaluateSlotGrid(
      fixedRun(["JAZZV", "VVVVV", "VVVVV"], { heavy: 1, twins: 1 }, [premium(0, 0, "2L"), premium(1, 0, "2W")]),
      testDictionary(["JAZZ"]),
    );
    assert.equal(result.total, 296);
  });

  it("scores a blank 0 on a letter cell but still counts a word cell under it", () => {
    const words = testDictionary(["CAT"]);
    const top = ["C", "?", "T", "V", "V"];
    assert.equal(evaluateSlotGrid(fixedRun([top, "VVVVV", "VVVVV"], {}, [premium(1, 0, "3L")]), words).total, 3);
    assert.equal(evaluateSlotGrid(fixedRun([top, "VVVVV", "VVVVV"], {}, [premium(1, 0, "3W")]), words).total, 9);
  });

  it("ignores cells on a wave line", () => {
    // Wave on three rows: rows 1, 2, 3, 2, 1. CATSV reads along it and along no row.
    const rows = ["CVVVV", "VAVSV", "VVTVV"];
    const words = testDictionary(["CATS"]);
    const cells = [premium(0, 0, "3L"), premium(1, 1, "3W"), premium(2, 2, "3L")];
    const plain = evaluateSlotGrid(fixedRun(rows, { wave: 1 }), words);
    const withCells = evaluateSlotGrid(fixedRun(rows, { wave: 1 }, cells), words);
    assert.equal(plain.words[0]?.line, "Wave");
    assert.equal(plain.total, 9);
    assert.equal(withCells.total, 9);
    assert.deepEqual(withCells.words[0]?.breakdown.wordCells, []);
  });

  it("refuses to swap a tile in or out of a word cell, at no cost", () => {
    const state = fixedRun(["CATSV", "VVVVV", "VVVVV"], {}, [premium(0, 0, "2L"), premium(2, 1, "2W")]);
    for (const [a, b] of [
      [[2, 1], [0, 0]],
      [[4, 2], [2, 1]],
    ] as const) {
      const result = swap(state, a, b);
      assert.deepEqual([result.ok, result.ok ? null : result.reason, result.state], [false, "cell-locked", state]);
    }
    assert.ok(swap(state, [0, 0], [1, 0]).ok, "a letter cell swaps");

    const all = { ...state, config: { ...state.config, cells: { ...state.config.cells, swapLock: "all" as const } } };
    assert.equal(swap(all, [0, 0], [1, 0]).ok, false);
    const none = { ...state, config: { ...state.config, cells: { ...state.config.cells, swapLock: "none" as const } } };
    assert.ok(swap(none, [2, 1], [0, 0]).ok);
  });

  it("lays no cells when the layout is none", () => {
    const run = createSlotRun("cells", { ...CONFIG, cells: { ...CONFIG.cells, layout: "none" } });
    assert.deepEqual(run.cells, []);
    assert.deepEqual(spun(run).cells, []);
  });
});
