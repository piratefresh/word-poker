/**
 * The power-up catalog (§44) is the one place a power is defined, so its shape is pinned here:
 * the v1 pool, the weights the Power Draw samples by, and the tags the nameplate prints.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_POWER_UP_SETTINGS,
  POWER_DRAW_OFFER_COUNT,
  POWER_UP_IDS,
  POWER_UPS,
  isPowerUpDealMode,
  isPowerUpId,
  isPowerUpSettings,
} from "../src/index";

describe("POWER_UPS", () => {
  it("defines every id once, under its own key", () => {
    assert.deepStrictEqual(Object.keys(POWER_UPS), [...POWER_UP_IDS]);
    for (const id of POWER_UP_IDS) {
      assert.strictEqual(POWER_UPS[id].id, id);
    }
  });

  it("keeps §44's v1 pool: three friendly tile swaps with 10 / 8 / 8 weights", () => {
    assert.deepStrictEqual(
      POWER_UP_IDS.map((id) => {
        const { title, tag, weight, window, family, hostile } = POWER_UPS[id];
        return { id, title, tag, weight, window, family, hostile };
      }),
      [
        {
          id: "random_wild",
          title: "Random Wild",
          tag: "WILD",
          weight: 10,
          window: "ownTurnOrWordWindow",
          family: "swapTile",
          hostile: false,
        },
        {
          id: "vowel_magnet",
          title: "Vowel Magnet",
          tag: "VOWEL",
          weight: 8,
          window: "ownTurnOrWordWindow",
          family: "swapTile",
          hostile: false,
        },
        {
          id: "mulligan",
          title: "Mulligan",
          tag: "MULLIGAN",
          weight: 8,
          window: "ownTurnOrWordWindow",
          family: "swapTile",
          hostile: false,
        },
      ],
    );
  });

  it("gives every power a card to draw: a description, an icon and a positive whole weight", () => {
    for (const id of POWER_UP_IDS) {
      const power = POWER_UPS[id];
      assert.ok(power.description.length > 0, id);
      assert.ok(power.icon.length > 0, id);
      assert.ok(Number.isInteger(power.weight) && power.weight > 0, id);
    }
  });

  it("holds enough powers to fill a Power Draw", () => {
    assert.ok(POWER_UP_IDS.length >= POWER_DRAW_OFFER_COUNT);
  });
});

describe("power-up guards", () => {
  it("knows a catalog id from anything else", () => {
    for (const id of POWER_UP_IDS) assert.ok(isPowerUpId(id));
    for (const value of ["RANDOM_WILD", "random-wild", "", null, 0]) {
      assert.ok(!isPowerUpId(value), JSON.stringify(value));
    }
  });

  it("reads the deal modes a room can run today", () => {
    assert.ok(isPowerUpDealMode("off"));
    assert.ok(isPowerUpDealMode("choose3"));
    for (const value of ["blindDraw", "sparse", "chaos", "custom", undefined]) {
      assert.ok(!isPowerUpDealMode(value), JSON.stringify(value));
    }
  });

  it("makes Classic the default", () => {
    assert.deepStrictEqual(DEFAULT_POWER_UP_SETTINGS, { deal: "off" });
    assert.ok(isPowerUpSettings(DEFAULT_POWER_UP_SETTINGS));
  });
});
