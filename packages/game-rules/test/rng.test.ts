import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng, mixSeed } from "../src/index";

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

describe("mixSeed", () => {
  const SALTS = ["offer", "letter"] as const;
  const SEATS = [0, 1, 2, 3, 4, 5];

  it("keeps the pinned values", () => {
    // Changing these numbers changes every Power Draw and every swapped letter for every seed.
    assert.deepEqual(
      [
        mixSeed(0, 0, "offer"),
        mixSeed(0, 0, "letter"),
        mixSeed(0, 1, "offer"),
        mixSeed(409, 2, "letter"),
        mixSeed(20260919, 5, "offer"),
        mixSeed(-7, 3, "letter"),
      ],
      [296091293, -2123858695, 1268650163, -1448664070, -1159251961, -177713575],
    );
  });

  it("returns an int32 and normalises the hand seed like createRng", () => {
    for (const salt of SALTS) {
      const mixed = mixSeed(409, 1, salt);
      assert.equal(mixed, mixed | 0);
      assert.equal(mixSeed(409.9, 1, salt), mixed);
      assert.equal(mixSeed(2 ** 32 + 409, 1, salt), mixed);
    }
  });

  it("gives every seat and every salt its own stream", () => {
    const seeds = SALTS.flatMap((salt) => SEATS.map((seat) => mixSeed(409, seat, salt)));
    assert.equal(new Set(seeds).size, seeds.length);
  });

  it("never lands on a deal seed a few hands on", () => {
    // Hand n deals from seed + n - 1, so an offset stream would replay a later hand's deal. Over a
    // spread of seeds, no mixed seed may sit within a thousand hands of its own hand seed.
    const HANDS_AHEAD = 1_000;
    for (let i = 0; i < 2_000; i += 1) {
      const handSeed = Math.imul(i, 0x2545f491) ^ i;
      for (const salt of SALTS) {
        for (const seat of SEATS) {
          const gap = (mixSeed(handSeed, seat, salt) - handSeed) | 0;
          assert.ok(
            gap < -HANDS_AHEAD || gap > HANDS_AHEAD,
            `seed ${handSeed}, seat ${seat}, ${salt}: ${gap} hands away`,
          );
        }
      }
    }
  });

  it("never gives two hands the same stream for one seat", () => {
    for (const salt of SALTS) {
      for (const seat of SEATS) {
        const seeds = Array.from({ length: 5_000 }, (_, hand) => mixSeed(409 + hand, seat, salt));
        assert.equal(new Set(seeds).size, seeds.length, `seat ${seat}, ${salt}`);
      }
    }
  });
});
