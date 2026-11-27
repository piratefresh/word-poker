import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SLOT_SPELLER_CONFIG,
  buildStrip,
  createSlotRun,
  nudge,
  payLines,
  slotLines,
  spin,
  swap,
  windowAt,
  type SlotActionResult,
  type SlotSpellerState,
} from "../src/index";

function ok(result: SlotActionResult): SlotSpellerState {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.state;
}

function play(seed: string): SlotSpellerState {
  let state = ok(spin(createSlotRun(seed)));
  state = ok(nudge(state, 1, -1));
  state = ok(swap(state, [0, 0], [4, 2]));
  return ok(spin({ ...state, phase: "between" }));
}

describe("Slot Speller reels", () => {
  it("builds strips of the configured length with a unique id per position", () => {
    const run = createSlotRun("strips");
    assert.equal(run.strips.length, 5);
    for (const strip of run.strips) assert.equal(strip.length, DEFAULT_SLOT_SPELLER_CONFIG.stripLength);
    const ids = run.strips.flat().map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(run.phase, "ready");
    assert.equal(run.round, 1);
    assert.equal(run.target, 20);
    assert.equal(run.grid.length, 5);
    assert.equal(run.grid[0]?.length, 3);
  });

  it("puts no DL or TL tiles on the strips by default", () => {
    const tiles = Array.from({ length: 50 }, (_, i) => buildStrip("rates", i, DEFAULT_SLOT_SPELLER_CONFIG)).flat();
    assert.ok(tiles.every((t) => t.multiplier === undefined));
  });

  it("rolls DL and TL at roughly the configured rates when they are turned on", () => {
    const tileRates = { doubleLetterChance: 0.15, tripleLetterChance: 0.03, highValueDoubleBonus: 0.05 };
    const tiles = Array.from({ length: 400 }, (_, i) => buildStrip("rates", i, { ...DEFAULT_SLOT_SPELLER_CONFIG, tileRates })).flat();
    const share = (pred: (t: (typeof tiles)[number]) => boolean, pool = tiles) => pool.filter(pred).length / pool.length;
    const low = tiles.filter((t) => t.points < 5);
    const high = tiles.filter((t) => t.points >= 5);
    // 12,000 tiles: TL 3%, DL 15% on low letters and 20% on letters worth 5 or more.
    assert.ok(Math.abs(share((t) => t.multiplier === "triple-letter") - 0.03) < 0.01);
    assert.ok(Math.abs(share((t) => t.multiplier === "double-letter", low) - 0.15) < 0.02);
    assert.ok(Math.abs(share((t) => t.multiplier === "double-letter", high) - 0.2) < 0.06);
  });

  it("replays the same grid from the same seed and actions", () => {
    assert.deepEqual(play("alpha").grid, play("alpha").grid);
    assert.notDeepEqual(play("alpha").grid, play("beta").grid);
  });

  it("continues identically after a JSON round trip mid-round", () => {
    let state = ok(spin(createSlotRun("save")));
    state = ok(nudge(state, 2, 1));
    const copy = JSON.parse(JSON.stringify(state)) as SlotSpellerState;
    const between = (s: SlotSpellerState): SlotSpellerState => ({ ...s, phase: "between" });
    assert.deepEqual(ok(spin(between(copy))), ok(spin(between(state))));
  });

  it("spins to a fresh grid, grants moves and spends a spin", () => {
    const run = createSlotRun("spin");
    const state = ok(spin(run));
    assert.equal(state.phase, "moving");
    assert.equal(state.moves, 4);
    assert.equal(state.spinsLeft, 2);
    assert.equal(state.spinCount, 1);
    state.grid.forEach((column, reel) => {
      assert.deepEqual(column, windowAt(state.strips[reel] ?? [], state.top[reel] ?? 0, 3));
    });
    assert.equal(ok(spin({ ...run, powers: { extraMove: 1 } })).moves, 6);
  });

  it("keeps a held reel's column through a spin and consumes the hold", () => {
    let state = ok(spin(createSlotRun("hold")));
    state = ok(swap(state, [1, 0], [3, 0]));
    const held = state.grid[1];
    const next = ok(spin({ ...state, phase: "between", holds: [1] }));
    assert.deepEqual(next.grid[1], held);
    assert.deepEqual(next.holds, []);
  });

  it("refuses illegal actions with the state unchanged and a reason", () => {
    const run = createSlotRun("refuse");
    const cases: [SlotActionResult, string, SlotSpellerState][] = [];
    cases.push([nudge(run, 0, 1), "wrong-phase", run]);
    cases.push([swap(run, [0, 0], [1, 0]), "wrong-phase", run]);
    const moving = ok(spin(run));
    cases.push([nudge(moving, 9, 1), "out-of-range", moving]);
    cases.push([nudge(moving, -1, -1), "out-of-range", moving]);
    cases.push([swap(moving, [0, 0], [0, 3]), "out-of-range", moving]);
    cases.push([swap(moving, [2, 1], [2, 1]), "same-cell", moving]);
    const spent = { ...moving, moves: 0 };
    cases.push([nudge(spent, 0, 1), "no-moves", spent]);
    cases.push([swap(spent, [0, 0], [1, 0]), "no-moves", spent]);
    cases.push([spin(moving), "wrong-phase", moving]);
    const dry: SlotSpellerState = { ...moving, phase: "between", spinsLeft: 0 };
    cases.push([spin(dry), "no-spins", dry]);
    const shop: SlotSpellerState = { ...run, phase: "shop" };
    cases.push([spin(shop), "wrong-phase", shop]);
    for (const [result, reason, before] of cases) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, reason);
      assert.equal(result.state, before);
    }
  });

  it("spends one move per nudge or swap", () => {
    let state = ok(spin(createSlotRun("moves")));
    state = ok(nudge(state, 0, 1));
    state = ok(swap(state, [0, 0], [1, 1]));
    assert.equal(state.moves, 2);
  });

  it("nudges up and down with wrap-around, keeping swapped tiles in view", () => {
    const moving = ok(spin(createSlotRun("nudge")));
    const strip = moving.strips[0] ?? [];
    const last = strip.length - 1;
    const atZero = { ...moving, top: moving.top.map((t, i) => (i === 0 ? 0 : t)), grid: moving.grid.map((c, i) => (i === 0 ? windowAt(strip, 0, 3) : c)) };

    const down = ok(nudge(atZero, 0, 1));
    assert.equal(down.top[0], last);
    assert.deepEqual(down.grid[0], [strip[last], strip[0], strip[1]]);

    const back = ok(nudge(down, 0, -1));
    assert.equal(back.top[0], 0);
    assert.deepEqual(back.grid[0], windowAt(strip, 0, 3));

    const nearEnd = { ...atZero, top: atZero.top.map((t, i) => (i === 0 ? last - 1 : t)), grid: atZero.grid.map((c, i) => (i === 0 ? windowAt(strip, last - 1, 3) : c)) };
    const up = ok(nudge(nearEnd, 0, -1));
    assert.equal(up.top[0], last);
    assert.deepEqual(up.grid[0], [strip[last], strip[0], strip[1]]);

    const swapped = ok(swap(atZero, [0, 1], [1, 1]));
    const foreign = swapped.grid[0]?.[1];
    assert.equal(ok(nudge(swapped, 0, -1)).grid[0]?.[0], foreign);
  });
});

describe("Slot Speller pay lines", () => {
  const rowsOf = (cells: readonly (readonly [number, number])[]): number[] => cells.map(([, row]) => row);

  it("pays one line per row, plus one per Extra Row", () => {
    assert.deepEqual(payLines(5, 3, {}).map((l) => l.name), ["Row 1", "Row 2", "Row 3"]);
    const run = createSlotRun("rows");
    assert.equal(slotLines({ ...run, powers: { extraRow: 2 } }).length, 5);
    assert.equal(slotLines({ ...run, powers: { extraRow: 5 } }).length, 5);
  });

  it("weaves Wave lines and their mirror for 3, 4 and 5 rows", () => {
    const wave = (rows: number): number[][] =>
      payLines(9, rows, { wave: 1 }).filter((l) => l.name.startsWith("Wave")).map((l) => rowsOf(l.cells));
    assert.deepEqual(wave(3), [
      [0, 1, 2, 1, 0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2, 1, 0, 1, 2],
    ]);
    assert.deepEqual(wave(4), [
      [0, 1, 2, 3, 2, 1, 0, 1, 2],
      [3, 2, 1, 0, 1, 2, 3, 2, 1],
    ]);
    assert.deepEqual(wave(5), [
      [0, 1, 2, 3, 4, 3, 2, 1, 0],
      [4, 3, 2, 1, 0, 1, 2, 3, 4],
    ]);
  });

  it("zigzags between every neighbouring row pair in both phases", () => {
    const zig = (rows: number): number[][] =>
      payLines(5, rows, { zigzag: 1 }).filter((l) => l.name.startsWith("Zigzag")).map((l) => rowsOf(l.cells));
    assert.deepEqual(zig(3), [
      [0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1],
      [1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2],
    ]);
    assert.equal(zig(4).length, 6);
    assert.equal(zig(5).length, 8);
    assert.deepEqual(zig(5)[7], [4, 3, 4, 3, 4]);
    assert.equal(payLines(5, 5, { wave: 1, zigzag: 1 }).length, 5 + 2 + 8);
  });
});
