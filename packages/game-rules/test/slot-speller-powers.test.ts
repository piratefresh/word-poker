import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import {
  DEFAULT_SLOT_SPELLER_CONFIG,
  SLOT_POWERS,
  addWildBlanks,
  buildStrip,
  buyPower,
  buyReel,
  buyRow,
  cellAt,
  canHold,
  createSlotRun,
  holdLimit,
  nextRound,
  pay,
  payLines,
  spin,
  stripTileId,
  toggleHold,
  windowAt,
  type SlotActionResult,
  type SlotPayResult,
  type SlotPowerId,
  type SlotSpellerState,
} from "../src/index";
import { testDictionary } from "./fixtures";
import { tile } from "./slot-speller-fixtures";

// Add Row, Wave, Zigzag and Extra Move are covered in slot-speller-reels/run tests; Long Haul,
// Action, Heavy and Twins (and their order) in slot-speller-scoring. This file covers the rest.

const empty = testDictionary([]);

function ok(result: SlotActionResult | SlotPayResult): SlotSpellerState {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.state;
}

function reason(result: SlotActionResult): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.reason;
}

/** A seeded run between spins (paid nothing toward its target), holding `powers`. */
function between(seed: string, powers: SlotSpellerState["powers"]): SlotSpellerState {
  const state = ok(pay(ok(spin({ ...createSlotRun(seed), powers })), empty));
  assert.equal(state.phase, "between");
  return state;
}

/** A seeded run in its first shop with `tokens`, offering `stock`. */
function inShop(seed: string, stock: SlotPowerId[]): SlotSpellerState {
  const run = createSlotRun(seed, { ...DEFAULT_SLOT_SPELLER_CONFIG, targets: [0] });
  const shop = ok(pay(ok(spin(run)), empty));
  assert.equal(shop.phase, "shop");
  return { ...shop, tokens: 100, shop: { stock, sold: [], rerolls: 0, earned: 0 } };
}

describe("Slot Speller power pool", () => {
  it("defines all eleven powers with a name, type, cost, max and description", () => {
    assert.equal(SLOT_POWERS.length, 11);
    assert.equal(new Set(SLOT_POWERS.map((p) => p.id)).size, 11);
    for (const power of SLOT_POWERS) {
      assert.ok(power.name.length > 0 && power.description.length > 0, power.id);
      assert.ok(["Grid", "Lines", "Moves", "Tiles", "Scoring"].includes(power.type), power.id);
      assert.ok(power.cost > 0 && power.max >= 1, power.id);
    }
  });
});

describe("Slot Speller holds and Big Hold", () => {
  it("holds one reel for free: its letters and premium cells stay through the next spin", () => {
    for (let i = 0; i < 20; i += 1) {
      const start = between(`hold-${i}`, {});
      assert.equal(canHold(start), true);
      assert.equal(holdLimit(start), 1);
      const reel = start.cells[0]?.reel ?? 0;
      const state = ok(toggleHold(start, reel));
      assert.deepEqual(state.holds, [reel]);
      assert.equal(state.moves, start.moves);

      const next = ok(spin(state));
      assert.deepEqual(next.grid[reel], state.grid[reel]);
      assert.equal(next.top[reel], state.top[reel]);
      const onReel = (cells: SlotSpellerState["cells"]) => cells.filter((cell) => cell.reel === reel);
      assert.ok(onReel(state.cells).length > 0);
      for (const cell of onReel(state.cells)) assert.ok(next.cells.some((kept) => JSON.stringify(kept) === JSON.stringify(cell)));
      assert.equal(next.cells.length, state.cells.length);
    }
  });

  it("releases a held reel when toggled again", () => {
    const state = ok(toggleHold(ok(toggleHold(between("hold", {}), 2)), 2));
    assert.deepEqual(state.holds, []);
    assert.deepEqual(ok(toggleHold(state, 4)).holds, [4]);
  });

  it("refuses a second reel without Big Hold, and a fourth with it", () => {
    const one = ok(toggleHold(between("hold", {}), 0));
    const second = toggleHold(one, 1);
    assert.equal(reason(second), "hold-full");
    assert.equal(second.state, one);

    let state = between("hold", { bigHold: 1 });
    assert.equal(holdLimit(state), 3);
    for (const reel of [0, 2, 4]) state = ok(toggleHold(state, reel));
    assert.deepEqual(state.holds, [0, 2, 4]);
    assert.equal(reason(toggleHold(state, 1)), "hold-full");
    const next = ok(spin(state));
    for (const reel of [0, 2, 4]) assert.deepEqual(next.grid[reel], state.grid[reel]);
  });

  it("refuses outside between and off the grid", () => {
    const ready = createSlotRun("hold");
    assert.equal(canHold(ready), false);
    assert.equal(reason(toggleHold(ready, 0)), "wrong-phase");
    const moving = ok(spin(ready));
    assert.equal(canHold(moving), false);
    assert.equal(reason(toggleHold(moving, 0)), "wrong-phase");
    assert.equal(reason(toggleHold(between("hold", {}), 9)), "out-of-range");
    assert.equal(reason(toggleHold(between("hold", {}), 0.5)), "out-of-range");
  });

  it("clears the holds after the spin, with no once-a-round limit", () => {
    const spun = ok(spin(ok(toggleHold(between("hold", {}), 0))));
    assert.deepEqual(spun.holds, []);
    const again = ok(pay(spun, empty));
    assert.equal(again.phase, "between");
    assert.equal(canHold(again), true);
    assert.deepEqual(ok(toggleHold(again, 1)).holds, [1]);
  });

  it("starts the next round with no holds", () => {
    const held = ok(toggleHold(between("hold", {}), 3));
    const shop = { ...held, phase: "shop" as const, shop: { stock: [], sold: [], rerolls: 0, earned: 0 } };
    const fresh = ok(nextRound(shop));
    assert.deepEqual(fresh.holds, []);
    assert.equal(canHold(fresh), false);
  });

  it("takes the hold counts from config", () => {
    const none = { ...between("hold", {}), config: { ...DEFAULT_SLOT_SPELLER_CONFIG, freeHolds: 0 } };
    assert.equal(canHold(none), false);
    assert.equal(reason(toggleHold(none, 0)), "hold-full");
    assert.equal(holdLimit({ ...none, powers: { bigHold: 1 } }), 2);
  });
});

describe("Slot Speller Wild Reel", () => {
  function blanks(strip: readonly Tile[]): number[] {
    return strip.flatMap((t, position) => ("blank" in t && t.blank ? [position] : []));
  }

  it("writes blanks over every strip at purchase and shows them in the grid", () => {
    const shop = inShop("wild", ["wild"]);
    const state = ok(buyPower(shop, "wild"));
    state.strips.forEach((strip, reel) => {
      const positions = blanks(strip);
      assert.ok(positions.length >= 1 && positions.length <= 2, `reel ${reel}`);
      for (const position of positions) {
        assert.deepEqual(strip[position], { id: stripTileId(reel, position), letter: "?", points: 0, blank: true });
      }
      strip.forEach((t, position) => {
        if (!positions.includes(position)) assert.deepEqual(t, shop.strips[reel]?.[position]);
      });
      assert.deepEqual(state.grid[reel], windowAt(strip, state.top[reel] ?? 0, 3));
    });
  });

  it("is deterministic and survives a JSON round trip", () => {
    const shop = inShop("wild", ["wild"]);
    const state = ok(buyPower(shop, "wild"));
    assert.deepEqual(ok(buyPower(inShop("wild", ["wild"]), "wild")), state);
    const copy = JSON.parse(JSON.stringify(state)) as SlotSpellerState;
    assert.deepEqual(copy, state);
    const nextA = ok(spin(ok(nextRound(state))));
    const nextB = ok(spin(ok(nextRound(copy))));
    assert.deepEqual(nextB, nextA);
  });

  it("gives a reel bought afterwards its blanks too", () => {
    const state = ok(buyReel(ok(buyPower(inShop("wild", ["wild"]), "wild"))));
    const reel = state.reels - 1;
    const strip = state.strips[reel] ?? [];
    assert.ok(blanks(strip).length >= 1);
    assert.deepEqual(strip, addWildBlanks(buildStrip("wild", reel, state.config), "wild", reel, state.config));
    const plain = ok(buyReel(inShop("wild", ["wild"])));
    assert.deepEqual(plain.strips[reel], buildStrip("wild", reel, plain.config));
  });
});

describe("Slot Speller Hot Cell and Jackpot Cell", () => {
  it("lays a permanent triple cell on a plain cell, the same one for the same seed", () => {
    const shop = inShop("hot", ["hot", "jackpot"]);
    const hot = ok(buyPower(shop, "hot"));
    const added = hot.cells.filter((cell) => cell.permanent);
    assert.equal(added.length, 1);
    const [cell] = added;
    assert.ok(cell);
    assert.deepEqual({ kind: cell.kind, multiplier: cell.multiplier }, { kind: "letter", multiplier: 3 });
    assert.equal(cellAt(shop.cells, [cell.reel, cell.row]), undefined);
    assert.equal(hot.tokens, 100 - 4);
    assert.deepEqual(ok(buyPower(JSON.parse(JSON.stringify(shop)) as SlotSpellerState, "hot")).cells, hot.cells);

    const jackpot = ok(buyPower(hot, "jackpot"));
    const word = jackpot.cells.filter((c) => c.permanent && c.kind === "word");
    assert.deepEqual(word.map((c) => c.multiplier), [3]);
    assert.equal(jackpot.tokens, 100 - 4 - 7);
  });

  it("can be bought again, each copy on a new plain cell", () => {
    let state = inShop("hot-again", ["hot"]);
    for (let i = 0; i < 3; i += 1) state = ok(buyPower({ ...state, shop: { stock: ["hot"], sold: [], rerolls: 0, earned: 0 } }, "hot"));
    const permanent = state.cells.filter((cell) => cell.permanent);
    assert.equal(permanent.length, 3);
    assert.equal(new Set(permanent.map((c) => `${c.reel},${c.row}`)).size, 3);
    assert.equal(state.powers.hot, 3);
  });

  it("stays put through spins, Add Reel and Add Row, and rolled cells never land on it", () => {
    let state = ok(buyPower(inShop("pinned", ["jackpot"]), "jackpot"));
    const pinned = state.cells.find((cell) => cell.permanent);
    assert.ok(pinned);
    state = ok(buyRow(ok(buyReel(state))));
    for (let i = 0; i < 3; i += 1) {
      state = ok(spin(ok(nextRound(state))));
      const here: SlotSpellerState["cells"] = state.cells.filter((cell) => cell.reel === pinned.reel && cell.row === pinned.row);
      assert.deepEqual(here, [pinned]);
      state = ok(pay(state, empty));
    }
  });
});

describe("Slot Speller Zigzag Lines by row pair", () => {
  it("pays only the pair bought, and refuses a missing or taken pair", () => {
    const shop = inShop("zig", ["zigzag"]);
    assert.equal(reason(buyPower(shop, "zigzag")), "out-of-range");
    assert.equal(reason(buyPower(shop, "zigzag", 2)), "out-of-range");
    const bought = ok(buyPower(shop, "zigzag", 1));
    assert.deepEqual(bought.zigzagPairs, [1]);
    assert.equal(bought.powers.zigzag, 1);
    const names = payLines(bought.reels, 3, bought.powers, bought.zigzagPairs).map((line) => line.name);
    assert.deepEqual(names.slice(3), ["Zigzag 2-3", "Zigzag 2-3 alt"]);
    const again = { ...bought, shop: { stock: ["zigzag" as const], sold: [], rerolls: 0, earned: 0 } };
    assert.equal(reason(buyPower(again, "zigzag", 1)), "out-of-range");
    assert.deepEqual(ok(buyPower(again, "zigzag", 0)).zigzagPairs, [0, 1]);
  });
});
