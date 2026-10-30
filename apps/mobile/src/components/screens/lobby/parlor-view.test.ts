import { WAITING_PHASE, ROUND_PHASES, type RoomSummary } from "@wordpoker/contracts";

import {
  featuredAction,
  featuredTable,
  openSeats,
  parlorStats,
  parlorView,
} from "./parlor-view";

/** One table as the listing carries it: the config it was created with, and its live seats. */
function table(roomId: string, overrides: Partial<Omit<RoomSummary, "metadata">> & {
  metadata?: Partial<RoomSummary["metadata"]>;
} = {}): RoomSummary {
  const { metadata, ...listing } = overrides;

  return {
    roomId,
    clients: 1,
    maxClients: 6,
    locked: false,
    ...listing,
    metadata: {
      name: `Table ${roomId}`,
      buyIn: 500,
      smallBlind: 5,
      bigBlind: 10,
      maxSeats: 6,
      powerUps: { deal: "off" },
      status: WAITING_PHASE,
      ...metadata,
    },
  };
}

/** A table whose hand is under way — §3's "in hand" read of a round phase. */
function inHand(roomId: string, overrides: Parameters<typeof table>[1] = {}): RoomSummary {
  return table(roomId, {
    ...overrides,
    metadata: { status: ROUND_PHASES[0], ...overrides.metadata },
  });
}

describe("openSeats", () => {
  test("counts the places a listing is holding open", () => {
    expect(openSeats(table("a", { clients: 2, maxClients: 6 }))).toBe(4);
  });

  test("never reports negative places when a listing overstates its clients", () => {
    // A seat taken in the instant before the room publishes its new listing: `-1` is not a figure
    // a player can act on, so the count floors at none.
    expect(openSeats(table("a", { clients: 7, maxClients: 6 }))).toBe(0);
  });
});

describe("featuredAction", () => {
  test("offers the last seat at a table that is one short", () => {
    expect(featuredAction(table("a", { clients: 5 }), false)).toEqual({
      label: "TAKE THE LAST SEAT",
      enabled: true,
    });
  });

  test("offers a seat plainly when several are open", () => {
    expect(featuredAction(table("a", { clients: 2 }), false)).toEqual({
      label: "TAKE A SEAT",
      enabled: true,
    });
  });

  test("turns the card into the way back to a seat this device holds", () => {
    expect(featuredAction(table("a", { clients: 6 }), true)).toEqual({
      label: "BACK TO YOUR SEAT",
      enabled: true,
    });
  });

  test.each([
    ["a full table", table("a", { clients: 6 }), "TABLE FULL"],
    ["a locked table", table("a", { locked: true }), "UNAVAILABLE"],
  ])("cannot be pressed at %s", (_case, room, label) => {
    expect(featuredAction(room, false)).toEqual({ label, enabled: false });
  });

  test("cannot be pressed when the Wallet is below the buy-in (§3)", () => {
    const room = table("a", { clients: 2 });
    expect(featuredAction(room, false, room.metadata.buyIn - 1)).toEqual({
      label: `NEED ${room.metadata.buyIn.toLocaleString("en-US")} COINS`,
      enabled: false,
    });
    expect(featuredAction(room, false, room.metadata.buyIn).enabled).toBe(true);
    expect(featuredAction(room, false, null).enabled).toBe(true);
    expect(featuredAction(room, true, 0).enabled).toBe(true);
  });
});

describe("featuredTable", () => {
  test("is nothing at all while no table is listed", () => {
    expect(featuredTable([], null)).toBeNull();
  });

  test("features a table with a hand under way over one that is still waiting", () => {
    const featured = featuredTable([table("waiting", { clients: 5 }), inHand("live")], null);

    expect(featured?.room.roomId).toBe("live");
    expect(featured?.status).toBe("in-hand");
  });

  test("features the fullest table of its kind — the one about to start", () => {
    const featured = featuredTable(
      [table("quiet", { clients: 1 }), table("nearly", { clients: 4 })],
      null,
    );

    expect(featured?.room.roomId).toBe("nearly");
    expect(featured?.openSeats).toBe(2);
  });

  test("breaks a tie of seats on the stakes, then on the room id so cards hold still", () => {
    // Two tables a player cannot tell apart must not trade places between two pushes, or the hero
    // card is a card nobody can aim at.
    const rich = table("b", { metadata: { buyIn: 50_000, smallBlind: 500, bigBlind: 1_000 } });
    expect(featuredTable([table("a"), rich], null)?.room.roomId).toBe("b");
    expect(featuredTable([table("a"), table("b")], null)?.room.roomId).toBe("a");
    expect(featuredTable([table("b"), table("a")], null)?.room.roomId).toBe("a");
  });

  test("still features a table nobody can sit at, rather than an empty card", () => {
    // The rows below the card carry the same listing: a full table is worth saying out loud.
    const featured = featuredTable(
      [table("full", { clients: 6 }), table("locked", { locked: true })],
      null,
    );

    expect(featured?.room.roomId).toBe("full");
    expect(featured?.action).toEqual({ label: "TABLE FULL", enabled: false });
  });

  test("reads the seat this device holds as its own", () => {
    expect(featuredTable([table("mine")], "mine")?.yours).toBe(true);
    expect(featuredTable([table("mine")], "elsewhere")?.yours).toBe(false);
  });
});

describe("parlorStats", () => {
  test("counts the room: its tables, its waiting ones, its free seats, its full ones and its hands", () => {
    const stats = parlorStats(
      [
        table("waiting", { clients: 2 }),
        inHand("live", { clients: 6 }),
        table("locked", { locked: true, clients: 0 }),
      ],
      null,
    );

    expect(stats.map((stat) => [stat.label, stat.value, stat.sub])).toEqual([
      ["TABLES", "3", "2 waiting"],
      ["SEATS OPEN", "4", "2 tables full"],
      ["IN HAND", "1", "hand running"],
    ]);
  });

  test("holds no seat at a locked table open", () => {
    // §3's "temporarily unavailable" is a table nobody can take a seat at right now, however many
    // of its places are empty.
    const [tables, seats] = parlorStats([table("locked", { locked: true, clients: 0 })], null);

    expect(tables.value).toBe("1");
    expect(seats.value).toBe("0");
  });

  test("leads with the seat this device holds, and lights it", () => {
    const stats = parlorStats([table("mine"), table("theirs")], "mine");
    const [yours, ...rest] = stats;

    expect(yours).toEqual({
      key: "yours",
      label: "YOUR SEAT",
      value: "Table mine",
      sub: "waiting for players",
      accent: true,
    });
    expect(rest.every((stat) => !stat.accent)).toBe(true);
  });

  test("lights the room's own size when the player holds no seat", () => {
    expect(parlorStats([table("a")], null)[0]).toMatchObject({ key: "tables", accent: true });
  });

  test("reads a hand under way at your own table back to you", () => {
    expect(parlorStats([inHand("mine")], "mine")[0]?.sub).toBe("a hand in play");
  });

  test("leads with a WALLET chip when coins are given, lit when no seat is held", () => {
    const stats = parlorStats([table("a")], null, 12_345);

    expect(stats[0]).toEqual({ key: "wallet", label: "WALLET", value: "12,345", sub: "coins", accent: true });
    // The wallet chip claims the accent the room-size chip would otherwise have taken.
    expect(stats.find((stat) => stat.key === "tables")?.accent).toBe(false);
  });

  test("the wallet chip yields its accent to the seat this device holds", () => {
    const stats = parlorStats([table("mine")], "mine", 500);

    expect(stats[0]).toMatchObject({ key: "wallet", accent: false });
    expect(stats.find((stat) => stat.key === "yours")?.accent).toBe(true);
  });

  test("shows no wallet chip at all without coins", () => {
    expect(parlorStats([table("a")], null).some((stat) => stat.key === "wallet")).toBe(false);
  });
});

describe("parlorView", () => {
  test("hands the hero card to one table and keeps the rest as rows, in the server's order", () => {
    const view = parlorView([table("a"), inHand("b"), table("c")], null);

    expect(view.featured?.room.roomId).toBe("b");
    expect(view.others.map((room) => room.roomId)).toEqual(["a", "c"]);
  });

  test("lists every table as a row while none of them is featured", () => {
    expect(parlorView([], null).others).toEqual([]);
    expect(parlorView([table("a")], null).others).toEqual([]);
  });
});
