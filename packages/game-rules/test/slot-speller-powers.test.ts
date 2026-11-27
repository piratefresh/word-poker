import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChoiceTile, Tile } from "@wordpoker/contracts";

import {
  DEFAULT_SLOT_SPELLER_CONFIG,
  DEFAULT_SPECIAL_TILES,
  LETTER_VALUES,
  SLOT_POWERS,
  addWildBlanks,
  buildStrip,
  buyPower,
  buyReel,
  canHold,
  createSlotRun,
  holdLimit,
  nextRound,
  pay,
  spin,
  stripTileId,
  toggleHold,
  windowAt,
  type Letter,
  type SlotActionResult,
  type SlotPayResult,
  type SlotPowerId,
  type SlotSpellerState,
} from "../src/index";
import { testDictionary } from "./fixtures";
import { tile } from "./slot-speller-fixtures";

// Extra Row, Wave, Zigzag and Extra Move are covered in slot-speller-reels/run tests; Long Haul,
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

function isChoiceTile(t: Tile): t is ChoiceTile {
  return "alternativeLetter" in t;
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

describe("Slot Speller Split Tiles", () => {
  it("gives exactly 2 grid tiles a second face each spin, with the right partner", () => {
    for (let i = 0; i < 25; i += 1) {
      const run = { ...createSlotRun(`split-${i}`), powers: { split: 1 } };
      const state = ok(spin(run));
      const split: [Tile, ChoiceTile][] = [];
      state.grid.forEach((column, reel) =>
        column.forEach((t, row) => {
          const landed = windowAt(state.strips[reel] ?? [], state.top[reel] ?? 0, 3)[row];
          assert.ok(landed);
          if (isChoiceTile(t)) split.push([landed, t]);
          else assert.deepEqual(t, landed);
        }),
      );
      assert.equal(split.length, 2);
      for (const [landed, t] of split) {
        assert.equal(t.id, landed.id);
        assert.equal(t.letter, landed.letter);
        assert.equal(t.multiplier, landed.multiplier);
        const pair = DEFAULT_SPECIAL_TILES.choicePairs.find((p) => p.includes(landed.letter));
        if (pair) assert.equal(t.alternativeLetter, pair[0] === landed.letter ? pair[1] : pair[0]);
        else assert.ok("AEIORSTN".includes(t.alternativeLetter) && t.alternativeLetter !== landed.letter);
        assert.equal(t.alternativePoints, LETTER_VALUES[t.alternativeLetter as Letter]);
      }
    }
  });

  it("is deterministic per seed and leaves the strips alone", () => {
    const run = { ...createSlotRun("split"), powers: { split: 1 } };
    const a = ok(spin(run));
    assert.deepEqual(ok(spin(JSON.parse(JSON.stringify(run)) as SlotSpellerState)), a);
    assert.deepEqual(a.strips, run.strips);
    assert.equal(ok(spin({ ...createSlotRun("split") })).grid.flat().some(isChoiceTile), false);
  });

  it("never splits a blank, a choice tile or a tile on a held reel", () => {
    const base = between("split-skip", { split: 1 });
    const blankStrip = base.strips[3]?.map((t) => tile("?", t.id)) ?? [];
    const choiceStrip = base.strips[4]?.map((t) => tile("K/Q", t.id)) ?? [];
    const state = { ...base, strips: [...base.strips.slice(0, 3), blankStrip, choiceStrip], holds: [0, 1, 2] };
    const next = ok(spin(state));
    for (const reel of [0, 1, 2]) assert.deepEqual(next.grid[reel], state.grid[reel]);
    assert.ok(next.grid[3]?.every((t) => "blank" in t && t.blank));
    assert.ok(next.grid[4]?.every((t) => isChoiceTile(t) && t.letter === "K" && t.alternativeLetter === "Q"));
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
