import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POWER_UP_IDS, POWER_UPS, type PowerUpId } from "@wordpoker/contracts";

import { createRng, mixSeed, weightedSampleWithoutReplacement } from "../src/index";

const weightOf = (id: PowerUpId): number => POWER_UPS[id].weight;

/** A pool wider than a draw, with uneven weights, so without-replacement has work to do. */
const POOL = [
  { id: "a", weight: 1 },
  { id: "b", weight: 2 },
  { id: "c", weight: 3 },
  { id: "d", weight: 4 },
] as const;

describe("weightedSampleWithoutReplacement", () => {
  it("replays the same draw for the same seed", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      assert.deepEqual(
        weightedSampleWithoutReplacement(POOL, (item) => item.weight, 3, createRng(seed)),
        weightedSampleWithoutReplacement(POOL, (item) => item.weight, 3, createRng(seed)),
      );
    }
  });

  it("keeps the pinned Power Draw for seed 409's first seat", () => {
    const rng = createRng(mixSeed(409, 0, "offer"));
    assert.deepEqual(weightedSampleWithoutReplacement(POWER_UP_IDS, weightOf, 3, rng), [
      "mulligan",
      "vowel_magnet",
      "random_wild",
    ]);
  });

  it("never draws an item twice", () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const drawn = weightedSampleWithoutReplacement(POOL, (item) => item.weight, 3, createRng(seed));
      assert.equal(drawn.length, 3);
      assert.equal(new Set(drawn).size, 3, `seed ${seed}`);
    }
  });

  it("returns the whole pool, in a seeded order, when the count covers it", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const drawn = weightedSampleWithoutReplacement(POWER_UP_IDS, weightOf, 3, createRng(seed));
      assert.deepEqual([...drawn].sort(), [...POWER_UP_IDS].sort());
      orders.add(drawn.join(","));
    }
    assert.equal(orders.size, 6, "every order of three turns up");

    const more = weightedSampleWithoutReplacement(POWER_UP_IDS, weightOf, 5, createRng(1));
    assert.equal(more.length, POWER_UP_IDS.length);
  });

  it("draws each item first in proportion to its weight", () => {
    const TRIALS = 40_000;
    const rng = createRng(20260930);
    const first = new Map<string, number>();
    for (let i = 0; i < TRIALS; i += 1) {
      const [head] = weightedSampleWithoutReplacement(POOL, (item) => item.weight, 3, rng);
      if (head !== undefined) first.set(head.id, (first.get(head.id) ?? 0) + 1);
    }

    const total = POOL.reduce((sum, item) => sum + item.weight, 0);
    for (const item of POOL) {
      const share = (first.get(item.id) ?? 0) / TRIALS;
      const expected = item.weight / total;
      assert.ok(Math.abs(share - expected) < 0.01, `${item.id}: ${share} vs ${expected}`);
    }
  });

  it("leaves a heavier item out of the three less often", () => {
    // Three of four: the left-out item is the fourth draw, so the lightest is left out most.
    const TRIALS = 20_000;
    const rng = createRng(7);
    const leftOut = new Map<string, number>();
    for (let i = 0; i < TRIALS; i += 1) {
      const drawn = new Set(weightedSampleWithoutReplacement(POOL, (item) => item.weight, 3, rng));
      for (const item of POOL) {
        if (!drawn.has(item)) leftOut.set(item.id, (leftOut.get(item.id) ?? 0) + 1);
      }
    }
    const counts = POOL.map((item) => leftOut.get(item.id) ?? 0);
    assert.deepEqual([...counts].sort((a, b) => b - a), counts, `left out: ${counts.join(", ")}`);
  });

  it("draws nothing for a count of zero, and consumes no roll", () => {
    let rolls = 0;
    const counted = () => {
      rolls += 1;
      return 0.5;
    };
    assert.deepEqual(weightedSampleWithoutReplacement(POOL, (item) => item.weight, 0, counted), []);
    assert.deepEqual(weightedSampleWithoutReplacement([], () => 1, 3, counted), []);
    assert.equal(rolls, 0);
  });

  it("uses one roll per item drawn, and lands a top roll on the last item", () => {
    let rolls = 0;
    const top = () => {
      rolls += 1;
      return 1 - Number.EPSILON;
    };
    const drawn = weightedSampleWithoutReplacement(POOL, (item) => item.weight, 2, top);
    assert.equal(rolls, 2);
    assert.deepEqual(
      drawn.map((item) => item.id),
      ["d", "c"],
    );
  });

  it("does not touch the pool it was given", () => {
    const pool = [...POWER_UP_IDS];
    weightedSampleWithoutReplacement(pool, weightOf, 2, createRng(3));
    assert.deepEqual(pool, [...POWER_UP_IDS]);
  });

  it("refuses a count or a weight it cannot sample by", () => {
    for (const count of [-1, 1.5, Number.NaN]) {
      assert.throws(() => weightedSampleWithoutReplacement(POOL, (item) => item.weight, count, createRng(1)), RangeError);
    }
    for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => weightedSampleWithoutReplacement(POOL, () => weight, 1, createRng(1)), RangeError);
    }
  });
});
