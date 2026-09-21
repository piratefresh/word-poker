/**
 * The runtime half of the room contract: the checks a create has to survive on both sides of the
 * socket, the stakes a buy-in derives, and the read of a listing entry that decides whether a
 * lobby row is something the app can draw.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUY_IN_PRESETS,
  MAX_SEATS,
  MIN_SEATS,
  isGameRoomMetadata,
  minBetFor,
  roomSummaryFromListing,
  tableStatus,
  validateRoomCreateOptions,
  type GameRoomMetadata,
} from "../src/index";

const TABLE = { name: "Sunset", buyIn: 5_000, maxSeats: 4 } as const;

/** A listing entry as the matchmaking listing shapes it. */
function listing(overrides: Record<string, unknown> = {}) {
  return {
    roomId: "abc123",
    name: "game",
    clients: 2,
    maxClients: 4,
    locked: false,
    metadata: { name: "Sunset", buyIn: 5_000, minBet: 100, maxSeats: 4, status: "waiting" },
    ...overrides,
  };
}

describe("minBetFor", () => {
  it("derives ADR 0001's 2% in whole coins for every preset", () => {
    assert.deepStrictEqual(BUY_IN_PRESETS.map(minBetFor), [10, 100, 1_000]);
  });
});

describe("validateRoomCreateOptions", () => {
  it("takes a legal table and hands back the trimmed name", () => {
    const checked = validateRoomCreateOptions({ ...TABLE, name: "  Sunset  " });

    assert.deepStrictEqual(checked, { ok: true, options: TABLE });
  });

  it("takes every preset and every seat count §5 allows", () => {
    for (const buyIn of BUY_IN_PRESETS) {
      for (let maxSeats = MIN_SEATS; maxSeats <= MAX_SEATS; maxSeats++) {
        const checked = validateRoomCreateOptions({ name: "Table", buyIn, maxSeats });
        assert.strictEqual(checked.ok, true, `${buyIn} coins at ${maxSeats} seats`);
      }
    }
  });

  it("refuses a name it cannot put on a card, and names the field", () => {
    for (const name of ["", "   ", "x".repeat(33), 42, null, undefined]) {
      const checked = validateRoomCreateOptions({ ...TABLE, name });
      assert.strictEqual(checked.ok, false, `name ${JSON.stringify(name)}`);
      assert.strictEqual(checked.ok === false && checked.refusal.field, "name");
      assert.ok(checked.ok === false && checked.refusal.message.length > 0);
    }
  });

  it("keeps a 32-character name", () => {
    const name = "x".repeat(32);
    assert.strictEqual(validateRoomCreateOptions({ ...TABLE, name }).ok, true);
  });

  it("refuses a buy-in §2 does not offer", () => {
    for (const buyIn of [1_000, 0, -500, 5_001, "500", null]) {
      const checked = validateRoomCreateOptions({ ...TABLE, buyIn });
      assert.strictEqual(checked.ok, false, `buy-in ${JSON.stringify(buyIn)}`);
      assert.strictEqual(checked.ok === false && checked.refusal.field, "buyIn");
    }
  });

  it("refuses a seat count outside 2–6, including a fractional one", () => {
    for (const maxSeats of [1, 7, 0, 3.5, "4", null]) {
      const checked = validateRoomCreateOptions({ ...TABLE, maxSeats });
      assert.strictEqual(checked.ok, false, `seats ${JSON.stringify(maxSeats)}`);
      assert.strictEqual(checked.ok === false && checked.refusal.field, "maxSeats");
    }
  });

  it("refuses anything that is not a create request at all", () => {
    for (const value of [null, undefined, "Table", 7, []]) {
      assert.strictEqual(validateRoomCreateOptions(value).ok, false, JSON.stringify(value));
    }
  });
});

describe("isGameRoomMetadata", () => {
  it("accepts a table's published config", () => {
    assert.strictEqual(isGameRoomMetadata({ ...TABLE, minBet: 100, status: "flop" }), true);
  });

  it("rejects a listing that is not one of our tables", () => {
    const published = { ...TABLE, minBet: 100, status: "waiting" };
    for (const value of [
      undefined,
      null,
      "table",
      { minBet: 100, status: "waiting" },
      { ...published, status: "lobby" },
      { ...published, buyIn: 1_234 },
      { ...published, status: undefined },
    ]) {
      assert.strictEqual(isGameRoomMetadata(value), false, JSON.stringify(value));
    }
  });
});

describe("tableStatus", () => {
  it("reads the synced phase as the two states §3 shows", () => {
    const waiting: GameRoomMetadata = { ...TABLE, minBet: 100, status: "waiting" };
    const playing: GameRoomMetadata = { ...TABLE, minBet: 100, status: "river" };

    assert.strictEqual(tableStatus(waiting), "waiting");
    assert.strictEqual(tableStatus(playing), "in-hand");
  });
});

describe("roomSummaryFromListing", () => {
  it("reads a listing entry as the row the lobby draws", () => {
    assert.deepStrictEqual(roomSummaryFromListing(listing()), {
      roomId: "abc123",
      clients: 2,
      maxClients: 4,
      locked: false,
      metadata: { name: "Sunset", buyIn: 5_000, minBet: 100, maxSeats: 4, status: "waiting" },
    });
  });

  it("reads a locked table as locked", () => {
    assert.strictEqual(roomSummaryFromListing(listing({ locked: true }))?.locked, true);
  });

  it("drops a listing it cannot describe", () => {
    for (const value of [
      null,
      "abc123",
      listing({ roomId: "" }),
      listing({ roomId: 7 }),
      listing({ clients: "2" }),
      listing({ maxClients: undefined }),
      listing({ metadata: undefined }),
      listing({ metadata: { name: "Sunset" } }),
    ]) {
      assert.strictEqual(roomSummaryFromListing(value), undefined, JSON.stringify(value));
    }
  });
});
