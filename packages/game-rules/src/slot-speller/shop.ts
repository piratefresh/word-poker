/** The shop a cleared round opens (§48, Shop): power cards, Add Reel and rerolls, paid in tokens. */

import { weightedSampleWithoutReplacement } from "../core/sample";
import { refuse, type SlotActionResult } from "./actions";
import { addPermanentCell, rollCells } from "./cells";
import { SLOT_POWERS, hasPower, type SlotPowerId } from "./powers";
import { addWildBlanks, buildStrip, rowCount, windowAt } from "./reels";
import { slotRng } from "./seed";
import type { SlotSpellerState } from "./state";

/** Row pairs Zigzag Lines does not pay yet, each the upper row's index. */
export function freeZigzagPairs(state: SlotSpellerState): number[] {
  return Array.from({ length: rowCount(state) - 1 }, (_, pair) => pair).filter((pair) => !state.zigzagPairs.includes(pair));
}

/** Whether `id` can still be offered: under its max, Zigzag with a free pair, the cell powers only with cells on. */
function offerable(state: SlotSpellerState, id: SlotPowerId, max: number): boolean {
  if (id === "zigzag") return freeZigzagPairs(state).length > 0;
  if ((id === "hot" || id === "jackpot") && state.config.cells.layout === "none") return false;
  return (state.powers[id] ?? 0) < max;
}

/**
 * Rolls a fresh stock: `shopOfferCount` powers the run can still take, from the run's next shop
 * generator. Returns the stock and the advanced roll counter.
 */
export function rollShopStock(state: SlotSpellerState): { stock: SlotPowerId[]; shopRolls: number } {
  const pool = SLOT_POWERS.filter((power) => offerable(state, power.id, power.max)).map((power) => power.id);
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

/** Add Row's price: `addRowCosts` by rows already bought, holding at its last price. */
export function addRowPrice(state: SlotSpellerState): number {
  const costs = state.config.addRowCosts;
  return costs[Math.min(state.rowsBought, costs.length - 1)] ?? 0;
}

/**
 * Buys one stock card: the power's count goes up and the card is sold. Zigzag Lines takes the row
 * pair it pays (`pair`, the upper row's index), which must be free. Hot Cell and Jackpot Cell lay
 * a permanent triple cell on a plain cell. Wild Reel writes its blanks onto every strip, then
 * refreshes every column from its strip at its current top so they show.
 */
export function buyPower(state: SlotSpellerState, id: SlotPowerId, pair?: number): SlotActionResult {
  const shop = state.shop;
  if (state.phase !== "shop" || shop === null) return refuse(state, "wrong-phase");
  const power = SLOT_POWERS.find((entry) => entry.id === id);
  if (power === undefined || !shop.stock.includes(id)) return refuse(state, "not-on-sale");
  if (shop.sold.includes(id)) return refuse(state, "sold");
  if (state.tokens < power.cost) return refuse(state, "not-enough-tokens");
  if (id === "zigzag" && (pair === undefined || !freeZigzagPairs(state).includes(pair))) return refuse(state, "out-of-range");

  const powers = { ...state.powers, [id]: (state.powers[id] ?? 0) + 1 };
  const rows = rowCount(state);
  const strips = id === "wild" ? state.strips.map((strip, reel) => addWildBlanks(strip, state.seed, reel, state.config)) : state.strips;
  const grid = id === "wild" ? strips.map((strip, reel) => windowAt(strip, state.top[reel] ?? 0, rows)) : state.grid;
  const { tripleLetterMultiplier, tripleWordMultiplier } = state.config.cells;
  const cells =
    id === "hot"
      ? addPermanentCell(state, rows, "letter", tripleLetterMultiplier)
      : id === "jackpot"
        ? addPermanentCell(state, rows, "word", tripleWordMultiplier)
        : state.cells;

  return {
    ok: true,
    state: {
      ...state,
      powers,
      strips,
      grid,
      cells,
      zigzagPairs: id === "zigzag" && pair !== undefined ? [...state.zigzagPairs, pair].sort((a, b) => a - b) : state.zigzagPairs,
      tokens: state.tokens - power.cost,
      shop: { ...shop, sold: [...shop.sold, id] },
    },
  };
}

/**
 * Buys a reel: a new seeded strip at top 0 joins on the right, with Wild Reel's blanks when held,
 * and the cells are laid again over the wider grid.
 * Always on sale, up to `maxReels`.
 */
export function buyReel(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "shop") return refuse(state, "wrong-phase");
  if (state.reels >= state.config.maxReels) return refuse(state, "max-reels");
  const price = addReelPrice(state);
  if (state.tokens < price) return refuse(state, "not-enough-tokens");

  const built = buildStrip(state.seed, state.reels, state.config);
  const strip = hasPower(state.powers, "wild") ? addWildBlanks(built, state.seed, state.reels, state.config) : built;
  return {
    ok: true,
    state: {
      ...state,
      strips: [...state.strips, strip],
      top: [...state.top, 0],
      grid: [...state.grid, windowAt(strip, 0, rowCount(state))],
      reels: state.reels + 1,
      ...rollCells(state, state.reels + 1, rowCount(state)),
      reelsBought: state.reelsBought + 1,
      tokens: state.tokens - price,
    },
  };
}

/**
 * Buys a row: every column refills from its strip at its current top, one tile taller, and the
 * cells are laid again so the new row has its own. The new row is a new paying line. Always on
 * sale, up to `maxRows`.
 */
export function buyRow(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "shop") return refuse(state, "wrong-phase");
  if (rowCount(state) >= state.config.maxRows) return refuse(state, "max-rows");
  const price = addRowPrice(state);
  if (state.tokens < price) return refuse(state, "not-enough-tokens");

  const rows = rowCount(state) + 1;
  return {
    ok: true,
    state: {
      ...state,
      grid: state.strips.map((strip, reel) => windowAt(strip, state.top[reel] ?? 0, rows)),
      ...rollCells(state, state.reels, rows),
      rowsBought: state.rowsBought + 1,
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
