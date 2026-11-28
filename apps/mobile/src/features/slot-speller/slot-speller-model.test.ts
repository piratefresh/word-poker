import type { Tile } from "@wordpoker/contracts";
import {
  createSlotRun,
  evaluateSlotGrid,
  isSwapLocked,
  scoreSlotWord,
  slotLines,
  type SlotCell,
  type SlotPremiumCell,
  type SlotSpellerState,
} from "@wordpoker/game-rules";

import { testDictionary } from "@/test-support/dictionary-fixtures";

import {
  createSlotModel,
  isRevealing,
  payBeat,
  payoutRows,
  randomSlotSeed,
  reduceSlotSpeller,
  workingLine,
} from "./slot-speller-model";

/** The word row 0 spells across every reel, as printed. */
function topRow(state: SlotSpellerState): string {
  return state.grid.map((column) => column[0]?.letter ?? "").join("").toUpperCase();
}

describe("reduceSlotSpeller", () => {
  const empty = testDictionary([]);

  it("spins, nudges and pays the top row into the round score", () => {
    let model = createSlotModel(createSlotRun("TEST01"));
    expect(model.state.phase).toBe("ready");

    model = reduceSlotSpeller(model, { type: "spin" }, empty);
    expect(model.state.phase).toBe("moving");
    expect(model.state.moves).toBe(4);

    model = reduceSlotSpeller(model, { type: "nudge", reel: 0, direction: -1 }, empty);
    expect(model.state.moves).toBe(3);

    model = reduceSlotSpeller(model, { type: "pay" }, testDictionary([topRow(model.state)]));
    expect(model.payout?.words.map((word) => word.word)).toContain(topRow(model.state));
    expect(model.payout?.total).toBeGreaterThan(0);
    expect(model.state.roundScore).toBe(model.payout?.total);
    expect(["between", "shop"]).toContain(model.state.phase);

    expect(isRevealing(model)).toBe(true);
    model = reduceSlotSpeller(model, { type: "skipReveal" }, empty);
    expect(model.revealStep).toBe(payoutRows(model.payout).length);
    expect(isRevealing(model)).toBe(false);
  });

  it("selects, deselects and swaps cells, spending a move per swap", () => {
    let model = reduceSlotSpeller(createSlotModel(createSlotRun("TEST02")), { type: "spin" }, empty);

    model = reduceSlotSpeller(model, { type: "tapCell", cell: [0, 0] }, empty);
    expect(model.selected).toEqual([0, 0]);
    model = reduceSlotSpeller(model, { type: "tapCell", cell: [0, 0] }, empty);
    expect(model.selected).toBeNull();

    const [first, second] = [model.state.grid[0]?.[0], model.state.grid[1]?.[2]];
    model = reduceSlotSpeller(model, { type: "tapCell", cell: [0, 0] }, empty);
    model = reduceSlotSpeller(model, { type: "tapCell", cell: [1, 2] }, empty);
    expect(model.selected).toBeNull();
    expect(model.state.moves).toBe(3);
    expect(model.state.grid[0]?.[0]).toEqual(second);
    expect(model.state.grid[1]?.[2]).toEqual(first);
  });

  it("refuses a tile on a swap-locked cell without spending a move", () => {
    let model = reduceSlotSpeller(createSlotModel(createSlotRun("TEST02")), { type: "spin" }, empty);
    const word = model.state.cells.find((cell) => isSwapLocked(model.state, [cell.reel, cell.row]));
    if (word === undefined) throw new Error("the starting grid has a word cell");
    const locked: SlotCell = [word.reel, word.row];
    const plain: SlotCell = [(word.reel + 1) % model.state.reels, (word.row + 1) % 3];
    expect(isSwapLocked(model.state, plain)).toBe(false);

    model = reduceSlotSpeller(model, { type: "tapCell", cell: plain }, empty);
    model = reduceSlotSpeller(model, { type: "tapCell", cell: locked }, empty);
    expect(model.refusedCell).toEqual(locked);
    expect(model.selected).toEqual(plain);
    expect(model.state.moves).toBe(4);

    model = reduceSlotSpeller(model, { type: "nudge", reel: 0, direction: 1 }, empty);
    expect(model.refusedCell).toBeNull();
  });

  it("hands back the same model when the engine refuses", () => {
    const model = createSlotModel(createSlotRun("TEST03"));
    expect(reduceSlotSpeller(model, { type: "pay" }, empty)).toBe(model);
    expect(reduceSlotSpeller(model, { type: "nudge", reel: 0, direction: 1 }, empty)).toBe(model);
    expect(reduceSlotSpeller(model, { type: "tapCell", cell: [0, 0] }, empty)).toBe(model);
  });
});

describe("the shop and holds", () => {
  const empty = testDictionary([]);
  /** A run standing in a freshly opened shop with tokens to spend. */
  function shopModel(tokens: number) {
    const state = createSlotRun("SHOP01");
    return createSlotModel({
      ...state,
      phase: "shop",
      tokens,
      shop: { stock: ["bigHold", "zigzag", "heavy"], sold: [], rerolls: 0, earned: tokens },
    });
  }

  it("buys Zigzag for a row pair and marks it sold", () => {
    let model = reduceSlotSpeller(shopModel(20), { type: "buyPower", power: "zigzag", pair: 1 }, empty);
    expect(model.state.tokens).toBe(14);
    expect(model.state.shop?.sold).toEqual(["zigzag"]);
    expect(model.state.zigzagPairs).toEqual([1]);
    const bought = model;
    model = reduceSlotSpeller(model, { type: "buyPower", power: "zigzag", pair: 0 }, empty);
    expect(model).toBe(bought);
  });

  it("buys a row, growing the grid", () => {
    const model = reduceSlotSpeller(shopModel(20), { type: "buyRow" }, empty);
    expect(model.state.tokens).toBe(12);
    expect(model.state.grid[0]).toHaveLength(4);
  });

  it("refuses what the tokens do not cover", () => {
    const model = shopModel(2);
    expect(reduceSlotSpeller(model, { type: "buyPower", power: "bigHold" }, empty)).toBe(model);
    expect(reduceSlotSpeller(model, { type: "buyReel" }, empty)).toBe(model);
  });

  it("adds a reel and rerolls the stock for tokens", () => {
    let model = reduceSlotSpeller(shopModel(20), { type: "buyReel" }, empty);
    expect(model.state.reels).toBe(6);
    expect(model.state.grid).toHaveLength(6);
    const tokens = model.state.tokens;
    model = reduceSlotSpeller(model, { type: "reroll" }, empty);
    expect(model.state.tokens).toBeLessThan(tokens);
    expect(model.state.shop?.rerolls).toBe(1);
  });

  it("holds a reel through the next spin and remembers it was held", () => {
    let model = reduceSlotSpeller(shopModel(20), { type: "buyPower", power: "bigHold" }, empty);
    model = reduceSlotSpeller(model, { type: "nextRound" }, empty);
    model = reduceSlotSpeller(model, { type: "spin" }, empty);
    model = reduceSlotSpeller(model, { type: "pay" }, empty);
    expect(model.state.phase).toBe("between");

    model = reduceSlotSpeller(model, { type: "toggleLock", reel: 2 }, empty);
    expect(model.state.holds).toEqual([2]);
    const kept = model.state.grid[2];
    model = reduceSlotSpeller(model, { type: "spin" }, empty);
    expect(model.held).toEqual([2]);
    expect(model.state.grid[2]).toEqual(kept);
  });
});

/** The number a working line ends on: what the word scores. */
function workedScore(line: string): number {
  return Number(line.split(/ = | → /).at(-1));
}

describe("the pay sequence and the working lines", () => {
  it("prints the rules' CAT example: a 3L cell, a half for length, rounded up", () => {
    const run = createSlotRun("TEST05");
    const faces = [
      { letter: "C", points: 4 },
      { letter: "A", points: 1 },
      { letter: "T", points: 2 },
    ].map(({ letter, points }) => ({ tile: { id: letter, letter, points } as Tile, letter, points }));
    const premiums = [undefined, { kind: "letter", multiplier: 3, reel: 1, row: 0 } as SlotPremiumCell];
    const breakdown = scoreSlotWord(faces, run.config, run.powers, premiums);
    expect(workingLine(breakdown, run.config.scoringPowerMultiplier)).toBe("C4 + A1×3L + T2 = 9 · ×½ length = 4.5 → 5");
  });

  it("gives the preview, the pay sequence and the list one total, rows, wave and zigzag lines all paying", () => {
    let model = reduceSlotSpeller(createSlotModel(createSlotRun("TEST06")), { type: "spin" }, testDictionary([]));
    // Wave and a Zigzag pair on, so the grid pays on every kind of line.
    model = { ...model, state: { ...model.state, powers: { ...model.state.powers, wave: 1 }, zigzagPairs: [0] } };
    // Every three-letter span of every line is a word: plenty of words, some overlapping lines.
    const spans = slotLines(model.state).flatMap((line) => {
      const letters = line.cells.map(([reel, row]) => model.state.grid[reel]?.[row]?.letter.toUpperCase() ?? "").join("");
      return Array.from({ length: letters.length - 2 }, (_, at) => letters.slice(at, at + 3));
    });
    const dictionary = testDictionary([...new Set(spans)]);

    const preview = evaluateSlotGrid(model.state, dictionary);
    expect(new Set(preview.words.map((word) => word.line.split(" ")[0]))).toEqual(new Set(["Row", "Wave", "Zigzag"]));

    const before = model.state.roundScore;
    model = reduceSlotSpeller(model, { type: "pay" }, dictionary);
    const payout = model.payout;
    if (payout === null) throw new Error("the pay was refused");
    expect(payout.total).toBe(preview.total);

    // Beat by beat the meter never runs ahead of the engine and ends on it.
    let meter = before;
    while (isRevealing(model)) {
      model = reduceSlotSpeller(model, { type: "revealNext" }, dictionary);
      const beat = payBeat(payout, model.revealStep);
      const shown = model.state.roundScore - payout.total + beat.paid;
      expect(shown).toBeGreaterThanOrEqual(meter);
      meter = shown;
    }
    expect(payBeat(payout, model.revealStep)).toMatchObject({ shown: payout.words.length, current: null, paid: payout.total });
    expect(meter).toBe(model.state.roundScore);

    const listed = payout.words.map((word) => workedScore(workingLine(word.breakdown, model.state.config.scoringPowerMultiplier)));
    expect(listed.reduce((sum, score) => sum + score, 0)).toBe(preview.total);
  });
});

describe("randomSlotSeed", () => {
  it("draws six characters without look-alikes", () => {
    expect(randomSlotSeed(() => 0)).toBe("AAAAAA");
    expect(randomSlotSeed(() => 0.999)).toBe("999999");
    expect(randomSlotSeed()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
