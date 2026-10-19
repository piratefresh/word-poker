import { WAITING_PHASE, blindsFor, type BuyInPreset, type RoomSummary } from "@wordpoker/contracts";

import { isFull, isJoinable, lobbyReadout, lobbyView, openSeats, pickHeadliner } from "./lobby-view";

function table(
  roomId: string,
  buyIn: BuyInPreset = 500,
  listing: Partial<Omit<RoomSummary, "metadata" | "roomId">> = {},
): RoomSummary {
  return {
    roomId,
    clients: 1,
    maxClients: 4,
    locked: false,
    ...listing,
    metadata: {
      name: roomId,
      buyIn,
      ...blindsFor(buyIn),
      maxSeats: 4,
      powerUps: { deal: "off" },
      status: WAITING_PHASE,
    },
  };
}

test("availability distinguishes full and locked rooms and clamps racing seat counts", () => {
  const open = table("open");
  const full = table("full", 500, { clients: 4 });
  const over = table("over", 500, { clients: 5 });
  const locked = table("locked", 500, { locked: true });
  expect(openSeats(open)).toBe(3);
  expect(isJoinable(open)).toBe(true);
  expect(isFull(full)).toBe(true);
  expect(openSeats(over)).toBe(0);
  expect(isFull(over)).toBe(true);
  expect(isJoinable(full)).toBe(false);
  expect(isFull(locked)).toBe(false);
  expect(isJoinable(locked)).toBe(false);
});

test("readout handles empty, singular, plural and unavailable seats", () => {
  expect(lobbyReadout([])).toBe("No tables yet");
  expect(lobbyReadout([table("a", 500, { clients: 3 })])).toBe("1 live · 1 open seat");
  expect(lobbyReadout([table("a"), table("b")])).toBe("2 live · 6 open seats");
  expect(lobbyReadout([
    table("locked", 500, { locked: true }),
    table("over", 500, { clients: 5 }),
  ])).toBe("2 live · 0 open seats");
});

test("headliner picks the highest available buy-in, with stable ties", () => {
  const low = table("low");
  const high = table("high", 5_000);
  const tie = table("tie", 5_000);
  const full = table("full", 50_000, { clients: 4 });
  const locked = table("locked", 50_000, { locked: true });
  expect(pickHeadliner([low, high, tie, full, locked])).toBe(high);
  expect(pickHeadliner([])).toBeUndefined();
  expect(pickHeadliner([full, locked])).toBeUndefined();
});

test("list excludes only the headliner, keeps server order and does not mutate the input", () => {
  const rooms = Object.freeze([table("a"), table("b", 5_000), table("c")]);
  const view = lobbyView(rooms);
  expect(view.headliner).toBe(rooms[1]);
  expect(view.listRooms).toEqual([rooms[0], rooms[2]]);
  expect(view.readout).toBe("3 live · 9 open seats");
  const full = table("full", 500, { clients: 4 });
  expect(lobbyView([full]).listRooms).toEqual([full]);
});
