import { createSlotRun, type SlotSpellerState } from "@wordpoker/game-rules";

import { testDictionary } from "@/test-support/dictionary-fixtures";

import { createSlotModel, isRevealing, payoutRows, randomSlotSeed, reduceSlotSpeller } from "./slot-speller-model";

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

  it("hands back the same model when the engine refuses", () => {
    const model = createSlotModel(createSlotRun("TEST03"));
    expect(reduceSlotSpeller(model, { type: "pay" }, empty)).toBe(model);
    expect(reduceSlotSpeller(model, { type: "nudge", reel: 0, direction: 1 }, empty)).toBe(model);
    expect(reduceSlotSpeller(model, { type: "tapCell", cell: [0, 0] }, empty)).toBe(model);
  });
});

describe("randomSlotSeed", () => {
  it("draws six characters without look-alikes", () => {
    expect(randomSlotSeed(() => 0)).toBe("AAAAAA");
    expect(randomSlotSeed(() => 0.999)).toBe("999999");
    expect(randomSlotSeed()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
