import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../src/index";

function draw(rng: () => number, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe("createRng", () => {
  it("replays the same sequence for the same seed", () => {
    assert.deepEqual(draw(createRng(20260919), 500), draw(createRng(20260919), 500));
  });

  it("keeps the pinned mulberry32 sequence", () => {
    // Cross-checked against the original C implementation and an independent transcription;
    // changing these numbers changes every deal for every existing seed.
    assert.deepEqual(draw(createRng(0), 5), [
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086,
    ]);
    assert.deepEqual(draw(createRng(42), 5), [
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423,
    ]);
  });

  it("yields different sequences for different seeds", () => {
    const seeds = [0, 1, 2, 42, 123456789];
    const sequences = seeds.map((seed) => draw(createRng(seed), 16).join(","));

    assert.equal(new Set(sequences).size, seeds.length);
  });

  it("stays inside [0, 1) on every draw", () => {
    for (const seed of [0, 1, -7, 2147483647]) {
      const rng = createRng(seed);
      for (let i = 0; i < 1000; i += 1) {
        const value = rng();
        assert.ok(value >= 0 && value < 1, `seed ${seed}, draw ${i}: ${value}`);
      }
    }
  });

  it("shares no state between instances", () => {
    const soloA = draw(createRng(11), 20);
    const soloB = draw(createRng(22), 20);

    const a = createRng(11);
    const b = createRng(22);
    const interleavedA: number[] = [];
    const interleavedB: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      interleavedA.push(a());
      interleavedB.push(b());
    }

    assert.deepEqual(interleavedA, soloA);
    assert.deepEqual(interleavedB, soloB);
  });

  it("normalises the seed to an int32", () => {
    assert.deepEqual(draw(createRng(7.5), 5), draw(createRng(7), 5));
    assert.deepEqual(draw(createRng(2 ** 32 + 5), 5), draw(createRng(5), 5));
  });
});
