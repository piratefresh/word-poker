import { createSlotRun, nextRound, type SlotSpellerState } from "@wordpoker/game-rules";

import {
  EMPTY_SLOT_RECORDS,
  loadSlotRun,
  newBests,
  persistSlotChange,
  saveSlotRun,
  slotRecords,
  updateRecords,
} from "./slot-speller-save";

const mockKv = new Map<string, string>();
jest.mock("@/lib/storage/claim-store", () => ({
  readItem: (key: string) => mockKv.get(key) ?? null,
  writeItem: (key: string, value: string) => void mockKv.set(key, value),
}));

beforeEach(() => mockKv.clear());

/** A run standing in a freshly opened shop, as a clear leaves it. */
function inShop(state: SlotSpellerState, round = state.round): SlotSpellerState {
  return { ...state, round, phase: "shop", tokens: 9, shop: { stock: ["wave", "bigHold", "heavy"], sold: [], rerolls: 0, earned: 9 } };
}

describe("the saved run", () => {
  it("round-trips a run exactly", () => {
    const state = inShop(createSlotRun("SAVE01"));
    saveSlotRun(state);
    expect(loadSlotRun()).toEqual(state);
  });

  it("resumes a run that continues like the original", () => {
    const state = inShop(createSlotRun("SAVE02"));
    saveSlotRun(state);
    const loaded = loadSlotRun();
    expect(loaded && nextRound(loaded).state).toEqual(nextRound(state).state);
  });

  it("falls back to no run for a missing, broken, old or foreign save", () => {
    expect(loadSlotRun()).toBeNull();
    mockKv.set("slot-speller-run", "{not json");
    expect(loadSlotRun()).toBeNull();
    mockKv.set("slot-speller-run", JSON.stringify({ version: 0, state: createSlotRun("OLD001") }));
    expect(loadSlotRun()).toBeNull();
    mockKv.set("slot-speller-run", JSON.stringify({ version: 1, state: { seed: "X" } }));
    expect(loadSlotRun()).toBeNull();
  });
});

describe("updateRecords", () => {
  const start = createSlotRun("REC001");

  it("counts a newly opened shop's round and stock", () => {
    const shop = inShop(start, 3);
    const records = updateRecords(EMPTY_SLOT_RECORDS, start, shop);
    expect(records.furthestRound).toBe(3);
    expect(records.discovered).toEqual(["wave", "bigHold", "heavy"]);
  });

  it("keeps the further round and orders discoveries by the pool", () => {
    const records = { furthestRound: 5, bestWord: null, discovered: ["heavy", "hot"] as const };
    const shop = inShop(start, 2);
    expect(updateRecords(records, start, shop)).toEqual({
      furthestRound: 5,
      bestWord: null,
      discovered: ["hot", "wave", "bigHold", "heavy"],
    });
  });

  it("takes a better best word and ignores a worse one", () => {
    const records = { ...EMPTY_SLOT_RECORDS, bestWord: { word: "CAT", score: 20 } };
    const better = updateRecords(records, start, { ...start, bestWord: { word: "QUARTZ", score: 90 } });
    expect(better.bestWord).toEqual({ word: "QUARTZ", score: 90 });
    expect(updateRecords(records, start, { ...start, bestWord: { word: "AT", score: 4 } })).toBe(records);
  });

  it("hands back the same records when nothing moved them", () => {
    const shop = inShop(start);
    const records = updateRecords(EMPTY_SLOT_RECORDS, start, shop);
    expect(updateRecords(records, shop, { ...shop, tokens: 1 })).toBe(records);
  });
});

describe("newBests", () => {
  it("flags only the records this run beat, from the mark a new run sets", () => {
    const old = { furthestRound: 2, bestWord: { word: "CAT", score: 20 }, discovered: ["hot"] as const };
    const played = { ...createSlotRun("NEW001"), round: 3, spinCount: 9 };
    const fresh = updateRecords(old, played, createSlotRun("NEW002"));
    expect(newBests(fresh)).toEqual({ furthestRound: false, bestWord: false, discovered: false });

    const run = createSlotRun("NEW002");
    const cleared = updateRecords(fresh, run, inShop(run, 3));
    expect(newBests(cleared)).toEqual({ furthestRound: true, bestWord: false, discovered: true });
  });

  it("flags nothing on records saved before the mark existed", () => {
    expect(newBests({ furthestRound: 4, bestWord: null, discovered: [] })).toEqual({
      furthestRound: false,
      bestWord: false,
      discovered: false,
    });
  });
});

describe("persistSlotChange", () => {
  it("saves the run and the records it moved", () => {
    const shop = inShop(createSlotRun("PER001"), 2);
    persistSlotChange(shop, createSlotRun("PER001"));
    expect(loadSlotRun()).toEqual(shop);
    expect(slotRecords().furthestRound).toBe(2);
    expect(JSON.parse(mockKv.get("slot-speller-records") ?? "null")).toMatchObject({ furthestRound: 2 });
  });
});
