import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SLOT_SPELLER_CONFIG,
  SLOT_POWERS,
  addReelPrice,
  addRowPrice,
  buyExtraSpin,
  buyPower,
  buyReel,
  buyRow,
  createSlotRun,
  endRun,
  nextRound,
  nudge,
  pay,
  rerollPrice,
  rerollShop,
  roundTarget,
  slotLines,
  spin,
  windowAt,
  type SlotActionResult,
  type SlotPayResult,
  type SlotSpellerState,
} from "../src/index";
import { testDictionary } from "./fixtures";
import { fixedRun } from "./slot-speller-fixtures";

const dictionary = testDictionary(["PIGS"]);
const empty = testDictionary([]);

function ok(result: SlotActionResult | SlotPayResult): SlotSpellerState {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.state;
}

function reason(result: SlotActionResult | SlotPayResult): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.reason;
}

/** A seeded run whose every pay clears (target 0), standing in its first shop. */
function inShop(seed = "shop", tokens = 100): SlotSpellerState {
  const run = createSlotRun(seed, { ...DEFAULT_SLOT_SPELLER_CONFIG, targets: [0] });
  const shop = ok(pay(ok(spin(run)), empty));
  assert.equal(shop.phase, "shop");
  return { ...shop, tokens };
}

/** The PIGS grid in `moving` with `spinsLeft` spins left and a target of `target`. */
function pigs(spinsLeft: number, target: number): SlotSpellerState {
  return { ...fixedRun(["PIGSV", "VVVVV", "VVVVV"]), spinsLeft, target };
}

describe("Slot Speller run", () => {
  it("replays a seeded run to the same round end from the same actions", () => {
    const play = (seed: string): SlotSpellerState => {
      let state = createSlotRun(seed);
      for (let i = 0; i < 3; i += 1) {
        state = ok(nudge(ok(spin(state)), 0, -1));
        state = ok(pay(state, empty));
      }
      return state;
    };
    assert.equal(play("replay").phase, "short");
    assert.deepEqual(play("replay"), play("replay"));
  });

  it("gives the same next spin after a JSON round trip mid-round", () => {
    const between = ok(pay(ok(spin(createSlotRun("save"))), empty));
    assert.equal(between.phase, "between");
    const copy = JSON.parse(JSON.stringify(between)) as SlotSpellerState;
    assert.deepEqual(ok(spin(copy)), ok(spin(between)));
  });

  it("pays the grid into the round score and returns the payout", () => {
    const result = pay(pigs(2, 100), dictionary);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payout.total, 10);
    assert.equal(result.payout.words[0]?.word, "PIGS");
    assert.equal(result.state.roundScore, 10);
    assert.deepEqual(result.state.bestWord, { word: "PIGS", score: 10 });
    assert.equal(result.state.phase, "between");
    assert.equal(reason(pay(result.state, dictionary)), "wrong-phase");
  });

  it("keeps the best word across pays", () => {
    const first = ok(pay(pigs(2, 100), dictionary));
    const weaker = { ...fixedRun(["PIGVV", "VVVVV", "VVVVV"]), bestWord: first.bestWord, target: 100 };
    assert.deepEqual(ok(pay(weaker, testDictionary(["PIG"]))).bestWord, { word: "PIGS", score: 10 });
  });

  it("clears for 5 tokens plus 2 per unused spin and opens the shop", () => {
    const cleared = ok(pay(pigs(2, 10), dictionary));
    assert.equal(cleared.phase, "shop");
    assert.equal(cleared.tokens, 9);
    assert.equal(cleared.shop?.earned, 9);
    assert.equal(cleared.shop?.stock.length, 3);
    assert.equal(ok(pay(pigs(0, 10), dictionary)).tokens, 5);
  });

  it("goes between with spins left and short without", () => {
    assert.equal(ok(pay(pigs(1, 100), dictionary)).phase, "between");
    assert.equal(ok(pay(pigs(0, 100), dictionary)).phase, "short");
  });

  it("allows spin only from ready or between with spins left", () => {
    const moving = ok(spin(createSlotRun("phases")));
    assert.equal(reason(spin(moving)), "wrong-phase");
    assert.equal(reason(spin({ ...moving, phase: "between", spinsLeft: 0 })), "no-spins");
  });

  it("sells one Extra Spin a round, only from short", () => {
    const short = { ...ok(pay(pigs(0, 100), dictionary)), tokens: 10 };
    assert.equal(reason(buyExtraSpin({ ...short, phase: "between" })), "wrong-phase");
    assert.equal(reason(buyExtraSpin({ ...short, tokens: 2 })), "not-enough-tokens");
    const extra = ok(buyExtraSpin(short));
    assert.equal(extra.phase, "between");
    assert.equal(extra.spinsLeft, 1);
    assert.equal(extra.tokens, 7);
    const shortAgain = ok(pay({ ...ok(spin(extra)), grid: short.grid }, dictionary));
    assert.equal(shortAgain.phase, "short");
    assert.equal(reason(buyExtraSpin(shortAgain)), "extra-spin-used");
    assert.equal(ok(endRun(shortAgain)).phase, "over");
    assert.equal(reason(endRun(extra)), "wrong-phase");
  });
});

describe("Slot Speller shop", () => {
  it("offers the same stock from the same seed, after a JSON round trip and after a reroll", () => {
    const shop = inShop("same");
    assert.deepEqual(inShop("same").shop, shop.shop);
    const copy = JSON.parse(JSON.stringify(shop)) as SlotSpellerState;
    assert.deepEqual(copy.shop, shop.shop);
    assert.deepEqual(ok(rerollShop(copy)).shop, ok(rerollShop(shop)).shop);
    const stocks = new Set(["a", "b", "c", "d", "e"].map((seed) => inShop(seed).shop?.stock.join()));
    assert.ok(stocks.size > 1);
  });

  it("leaves powers held at their max, and Zigzag with no free pair, out of the stock", () => {
    const capped = Object.fromEntries(
      SLOT_POWERS.filter((p) => Number.isFinite(p.max) && p.id !== "wave").map((p) => [p.id, p.max]),
    );
    const base = inShop();
    let state: SlotSpellerState = { ...base, powers: capped, zigzagPairs: [0] };
    state = ok(rerollShop(state));
    assert.equal(state.shop?.stock.length, 3);
    for (const id of state.shop?.stock ?? []) assert.ok(["hot", "jackpot", "wave", "zigzag"].includes(id), id);
    for (let i = 0; i < 20; i += 1) {
      state = ok(rerollShop({ ...state, tokens: 100, zigzagPairs: [0, 1] }));
      assert.ok(!state.shop?.stock.includes("zigzag"));
    }
    const noCells = { ...state, tokens: 100, config: { ...state.config, cells: { ...state.config.cells, layout: "none" as const } } };
    assert.deepEqual(ok(rerollShop(noCells)).shop?.stock, ["wave"]);
  });

  it("sells each stock card once, for its cost", () => {
    const shop = inShop();
    const id = shop.shop?.stock.find((entry) => entry !== "zigzag");
    assert.ok(id !== undefined);
    const cost = SLOT_POWERS.find((p) => p.id === id)?.cost ?? 0;
    const bought = ok(buyPower(shop, id));
    assert.equal(bought.powers[id], 1);
    assert.equal(bought.tokens, 100 - cost);
    assert.equal(reason(buyPower(bought, id)), "sold");
    const missing = SLOT_POWERS.find((p) => !shop.shop?.stock.includes(p.id))?.id;
    assert.ok(missing !== undefined);
    assert.equal(reason(buyPower(shop, missing)), "not-on-sale");
    assert.equal(reason(buyPower({ ...shop, tokens: 0 }, id)), "not-enough-tokens");
    assert.equal(reason(buyPower({ ...shop, phase: "between" }, id)), "wrong-phase");
  });

  it("sells Add Row for 8 then 12, up to 5 rows, growing every column and adding a line", () => {
    let state = { ...inShop(), tokens: 30 };
    assert.equal(addRowPrice(state), 8);
    state = ok(buyRow(state));
    assert.equal(state.tokens, 22);
    assert.equal(addRowPrice(state), 12);
    state.grid.forEach((column, reel) => assert.deepEqual(column, windowAt(state.strips[reel] ?? [], state.top[reel] ?? 0, 4)));
    assert.equal(slotLines(state).length, 4);
    assert.ok(state.cells.some((cell) => cell.row === 3));
    state = ok(buyRow(state));
    assert.equal(state.tokens, 10);
    assert.equal(state.grid[0]?.length, 5);
    assert.equal(reason(buyRow({ ...state, tokens: 100 })), "max-rows");
    assert.equal(reason(buyRow({ ...inShop(), tokens: 7 })), "not-enough-tokens");
    assert.equal(reason(buyRow({ ...inShop(), phase: "between" })), "wrong-phase");
  });

  it("prices Add Reel 3, 4, 5… and caps it at 12 reels", () => {
    let state = { ...inShop(), tokens: 1000 };
    const prices: number[] = [];
    while (state.reels < 12) {
      prices.push(addReelPrice(state));
      const before = state.tokens;
      state = ok(buyReel(state));
      assert.equal(state.tokens, before - (prices.at(-1) ?? 0));
    }
    assert.deepEqual(prices, [3, 4, 5, 6, 7, 8, 9]);
    assert.equal(reason(buyReel(state)), "max-reels");
    assert.equal(state.strips.length, 12);
    assert.equal(state.top[11], 0);
    assert.deepEqual(state.grid[11], windowAt(state.strips[11] ?? [], 0, 3));
    assert.equal(reason(buyReel({ ...inShop(), tokens: 2 })), "not-enough-tokens");
  });

  it("prices rerolls 1, 2, 3… and resets them in the next shop, carrying tokens", () => {
    let state = inShop("reroll", 20);
    const prices: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      prices.push(rerollPrice(state));
      state = ok(rerollShop(state));
      assert.deepEqual(state.shop?.sold, []);
    }
    assert.deepEqual(prices, [1, 2, 3]);
    assert.equal(state.tokens, 14);

    const next = ok(nextRound(state));
    assert.equal(next.phase, "ready");
    assert.equal(next.round, 2);
    assert.equal(next.tokens, 14);
    assert.equal(next.shop, null);
    assert.equal(next.spinsLeft, 3);
    assert.equal(next.roundScore, 0);
    assert.equal(next.extraSpinUsed, false);
    assert.equal(reason(nextRound(next)), "wrong-phase");

    const again = ok(pay(ok(spin(next)), empty));
    assert.equal(again.phase, "shop");
    assert.equal(rerollPrice(again), 1);
  });

  it("sets the next round's target from the config", () => {
    const next = ok(nextRound(ok(pay(pigs(2, 10), dictionary))));
    assert.equal(next.target, roundTarget(DEFAULT_SLOT_SPELLER_CONFIG, 2));
  });

  it("reads targets from the table, then grows the last one by targetGrowth a round", () => {
    const config = { ...DEFAULT_SLOT_SPELLER_CONFIG, targets: [20, 40, 100], targetGrowth: 0.2 };
    assert.deepEqual([1, 2, 3, 4, 5].map((round) => roundTarget(config, round)), [20, 40, 100, 120, 144]);
  });
});
