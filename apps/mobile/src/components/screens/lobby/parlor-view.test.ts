import { WAITING_PHASE, ROUND_PHASES, type RoomSummary } from "@wordpoker/contracts";

import {
  featuredTable,
  joinNote,
  joinOffer,
  openSeats,
  parlorStats,
  parlorView,
  tableThatFits,
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

// Design 1a's example: a 5,450 Wallet, Corner Table at 500, High Stakes at 5,000, Penthouse at 50,000.
const corner = table("corner", { clients: 4, metadata: { name: "Corner Table", buyIn: 500, smallBlind: 10, bigBlind: 20 } });
const high = table("high", { clients: 2, metadata: { name: "High Stakes", buyIn: 5_000, smallBlind: 100, bigBlind: 200 } });
const penthouse = table("penthouse", { metadata: { name: "Penthouse", buyIn: 50_000, smallBlind: 1_000, bigBlind: 2_000 } });

describe("joinOffer", () => {
  test("puts the price on a Join the Wallet covers", () => {
    expect(joinOffer(corner, { coins: 5_450 })).toEqual({
      kind: "open",
      enabled: true,
      label: "JOIN",
      price: "500",
      rowLabel: "JOIN · 500",
      spoken: "Join Corner Table for 500 coins. You have 5,450 coins.",
    });
  });

  test("names the shortfall, not the price, when the Wallet is short (§3)", () => {
    expect(joinOffer(high, { coins: 1_200 })).toMatchObject({
      kind: "short",
      enabled: false,
      label: "NEED 3,800 MORE COINS",
      rowLabel: "NEED 3,800 MORE",
      spoken: "Join unavailable. You need 5,000 coins and have 1,200.",
    });
    expect(joinOffer(penthouse, { coins: 5_450 }).rowLabel).toBe("NEED 44,550 MORE");
    expect(joinOffer(high, { coins: 5_000 }).kind).toBe("open");
  });

  test("leaves an unread Wallet to the server to judge", () => {
    expect(joinOffer(penthouse, { coins: null })).toMatchObject({
      kind: "open",
      spoken: "Join Penthouse for 50,000 coins.",
    });
  });

  test("cannot be pressed while the seat is being taken", () => {
    expect(joinOffer(high, { coins: 5_450, joining: true })).toMatchObject({
      kind: "joining",
      enabled: false,
      label: "TAKING YOUR SEAT ···",
      price: null,
    });
  });

  test("is the way back to a seat this device holds, whatever the table or Wallet", () => {
    expect(joinOffer(table("a", { clients: 6 }), { yours: true, coins: 0 })).toMatchObject({
      kind: "yours",
      enabled: true,
      label: "BACK TO YOUR SEAT",
      price: null,
      rowLabel: "YOUR SEAT",
    });
  });

  test.each([
    ["a full table", table("a", { clients: 6 }), {}, "full", "TABLE FULL", "FULL", "Join unavailable, this table is full."],
    ["a locked table", table("a", { locked: true }), {}, "locked", "LOCKED", "LOCKED", "Join unavailable, this table is locked."],
    ["a guest", table("a"), { guest: true }, "guest", "ACCOUNT NEEDED", "ACCOUNT NEEDED", "Join unavailable, online tables need an account."],
  ])("cannot be pressed at %s", (_case, room, context, kind, label, rowLabel, spoken) => {
    expect(joinOffer(room, context)).toEqual({ kind, enabled: false, label, price: null, rowLabel, spoken });
  });
});

describe("joinNote", () => {
  test("shows the Wallet moving on the hero card, and what the coins become on the sheet", () => {
    expect(joinNote(corner, { coins: 5_450 }, "card")).toBe("Wallet 5,450 → 4,950 coins");
    expect(joinNote(high, { coins: 5_450 }, "sheet")).toBe(
      "5,000 coins become chips at this table. Whatever is left comes back as coins when you leave.",
    );
  });

  test("says what the Wallet holds against what the table takes", () => {
    expect(joinNote(high, { coins: 1_200 }, "sheet")).toBe("You have 1,200 coins. This table takes 5,000.");
  });

  test("says the coins are moving while the seat is taken", () => {
    expect(joinNote(high, { coins: 5_450, joining: true }, "sheet")).toBe("Moving 5,000 coins to the table");
  });

  test("points a full table at one that fits", () => {
    const full = table("full", { clients: 6 });
    expect(joinNote(full, {}, "sheet", corner)).toBe(
      "A seat opens when someone leaves. Corner Table has 2 free seats.",
    );
    expect(joinNote(full, {}, "sheet")).toBe("A seat opens when someone leaves.");
  });

  test("says nothing under your own seat", () => {
    expect(joinNote(corner, { yours: true, coins: 5_450 }, "card")).toBeNull();
  });
});

describe("tableThatFits", () => {
  test("is the cheapest table with a seat the Wallet covers", () => {
    expect(tableThatFits([penthouse, high, corner], 5_450)?.roomId).toBe("corner");
    expect(tableThatFits([penthouse, high], 1_200)).toBeNull();
  });

  test("skips the table it is pointing away from, full ones and locked ones", () => {
    const full = table("full", { clients: 6, metadata: { buyIn: 500 } });
    const locked = table("locked", { locked: true, metadata: { buyIn: 500 } });
    expect(tableThatFits([full, locked, corner, high], 5_450, "corner")?.roomId).toBe("high");
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
