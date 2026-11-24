/** The shop a cleared round opens (§47, Shop): power cards, Add Reel and rerolls, paid in tokens. */

import { weightedSampleWithoutReplacement } from "../core/sample";
import { refuse, type SlotActionResult } from "./actions";
import { SLOT_POWERS, type SlotPowerId } from "./powers";
import { buildStrip, rowCount, windowAt } from "./reels";
import { slotRng } from "./seed";
import type { SlotSpellerState } from "./state";

/**
 * Rolls a fresh stock: `shopOfferCount` powers the run does not already hold at their max, from
 * the run's next shop generator. Returns the stock and the advanced roll counter.
 */
export function rollShopStock(state: SlotSpellerState): { stock: SlotPowerId[]; shopRolls: number } {
  const pool = SLOT_POWERS.filter((power) => (state.powers[power.id] ?? 0) < power.max).map((power) => power.id);
  const rng = slotRng(state.seed, "shop", state.shopRolls);
  return {
    stock: weightedSampleWithoutReplacement(pool, () => 1, state.config.shopOfferCount, rng),
    shopRolls: state.shopRolls + 1,
  };
}

/** Add Reel's price: the base cost plus one per reel already bought. */
export function addReelPrice(state: SlotSpellerState): number {
  return state.config.addReelBaseCost + state.reelsBought;
}

/** A reroll's price: the base cost plus one per reroll already paid in this shop. */
export function rerollPrice(state: SlotSpellerState): number {
  return state.config.rerollBaseCost + (state.shop?.rerolls ?? 0);
}

/**
 * Buys one stock card: the power's count goes up and the card is sold. Extra Row refills every
 * column from its strip at its current top, so the grid stays one row taller everywhere.
 */
export function buyPower(state: SlotSpellerState, id: SlotPowerId): SlotActionResult {
  const shop = state.shop;
  if (state.phase !== "shop" || shop === null) return refuse(state, "wrong-phase");
  const power = SLOT_POWERS.find((entry) => entry.id === id);
  if (power === undefined || !shop.stock.includes(id)) return refuse(state, "not-on-sale");
  if (shop.sold.includes(id)) return refuse(state, "sold");
  if (state.tokens < power.cost) return refuse(state, "not-enough-tokens");

  const powers = { ...state.powers, [id]: (state.powers[id] ?? 0) + 1 };
  const rows = rowCount(state.config, powers);
  const grid =
    id === "extraRow" ? state.strips.map((strip, reel) => windowAt(strip, state.top[reel] ?? 0, rows)) : state.grid;

  return {
    ok: true,
    state: { ...state, powers, grid, tokens: state.tokens - power.cost, shop: { ...shop, sold: [...shop.sold, id] } },
  };
}

/** Buys a reel: a new seeded strip at top 0 joins on the right. Always on sale, up to `maxReels`. */
export function buyReel(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "shop") return refuse(state, "wrong-phase");
  if (state.reels >= state.config.maxReels) return refuse(state, "max-reels");
  const price = addReelPrice(state);
  if (state.tokens < price) return refuse(state, "not-enough-tokens");

  const strip = buildStrip(state.seed, state.reels, state.config);
  return {
    ok: true,
    state: {
      ...state,
      strips: [...state.strips, strip],
      top: [...state.top, 0],
      grid: [...state.grid, windowAt(strip, 0, rowCount(state.config, state.powers))],
      reels: state.reels + 1,
      reelsBought: state.reelsBought + 1,
      tokens: state.tokens - price,
    },
  };
}

/** Pays for a new stock; nothing in it is sold yet. */
export function rerollShop(state: SlotSpellerState): SlotActionResult {
  const shop = state.shop;
  if (state.phase !== "shop" || shop === null) return refuse(state, "wrong-phase");
  const price = rerollPrice(state);
  if (state.tokens < price) return refuse(state, "not-enough-tokens");

  const { stock, shopRolls } = rollShopStock(state);
  return {
    ok: true,
    state: {
      ...state,
      tokens: state.tokens - price,
      shopRolls,
      shop: { ...shop, stock, sold: [], rerolls: shop.rerolls + 1 },
    },
  };
}
