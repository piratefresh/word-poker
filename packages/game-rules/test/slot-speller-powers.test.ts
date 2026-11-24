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
  canLock,
  createSlotRun,
  nextRound,
  pay,
  spin,
  stripTileId,
  toggleLock,
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
  const run = createSlotRun(seed, { ...DEFAULT_SLOT_SPELLER_CONFIG, baseTarget: 0 });
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

describe("Slot Speller Reel Lock", () => {
  it("holds the chosen reels through the next spin and spends the lock", () => {
    let state = between("lock", { lock: 1 });
    assert.equal(canLock(state), true);
    state = ok(toggleLock(state, 1));
    state = ok(toggleLock(state, 3));
    assert.deepEqual(state.locks, [1, 3]);
    const next = ok(spin(state));
    assert.deepEqual(next.grid[1], state.grid[1]);
    assert.deepEqual(next.grid[3], state.grid[3]);
    assert.deepEqual(next.locks, []);
    assert.equal(next.lockUsed, true);
  });

  it("releases a held reel when toggled again", () => {
    const state = ok(toggleLock(ok(toggleLock(between("lock", { lock: 1 }), 2)), 2));
    assert.deepEqual(state.locks, []);
    assert.equal(state.lockUsed, false);
  });

  it("refuses outside between, without the power, a third reel and off the grid", () => {
    const moving = ok(spin({ ...createSlotRun("lock"), powers: { lock: 1 } }));
    assert.equal(reason(toggleLock(moving, 0)), "wrong-phase");
    assert.equal(canLock(moving), false);
    assert.equal(reason(toggleLock(between("lock", {}), 0)), "no-power");
    const two = ok(toggleLock(ok(toggleLock(between("lock", { lock: 1 }), 0)), 1));
    const third = toggleLock(two, 2);
    assert.equal(reason(third), "lock-full");
    assert.equal(third.state, two);
    assert.equal(reason(toggleLock(two, 9)), "out-of-range");
  });

  it("is used once a round and available again next round", () => {
    const spent = ok(pay(ok(spin(ok(toggleLock(between("lock", { lock: 1 }), 0)))), empty));
    assert.equal(spent.phase, "between");
    assert.equal(canLock(spent), false);
    assert.equal(reason(toggleLock(spent, 1)), "lock-used");

    const shop = { ...spent, phase: "shop" as const, shop: { stock: [], sold: [], rerolls: 0, earned: 0 } };
    const fresh = ok(pay(ok(spin(ok(nextRound(shop)))), empty));
    assert.equal(fresh.lockUsed, false);
    assert.equal(canLock(fresh), true);
  });

  it("is not spent by a spin with no reel held", () => {
    const state = ok(pay(ok(spin(between("lock", { lock: 1 }))), empty));
    assert.equal(canLock(state), true);
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

  it("never splits a blank, a choice tile or a tile on a locked reel", () => {
    const base = between("split-skip", { split: 1 });
    const blankStrip = base.strips[3]?.map((t) => tile("?", t.id)) ?? [];
    const choiceStrip = base.strips[4]?.map((t) => tile("K/Q", t.id)) ?? [];
    const state = { ...base, strips: [...base.strips.slice(0, 3), blankStrip, choiceStrip], locks: [0, 1, 2] };
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
