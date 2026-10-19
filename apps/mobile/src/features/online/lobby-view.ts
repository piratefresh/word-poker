import type { RoomSummary } from "@wordpoker/contracts";

export const LOBBY_FILTERS = ["All", "Open seats", "Classic", "Wild Power", "Low stakes", "High stakes"] as const;
export type LobbyFilter = (typeof LOBBY_FILTERS)[number];

/** The middle legal buy-in starts the high-stakes tier; all presets remain covered. */
const HIGH_STAKES_FROM = 5_000;

/** Seats left, including at a locked table. A racing listing must never show negatives. */
export function openSeats(room: RoomSummary): number {
  return Math.max(0, room.maxClients - room.clients);
}

export function isFull(room: RoomSummary): boolean {
  return openSeats(room) === 0;
}

export function isJoinable(room: RoomSummary): boolean {
  return !room.locked && !isFull(room);
}

/** Editorial headliner when available; otherwise highest buy-in with a seat, stably ordered. */
export function pickHeadliner(rooms: readonly RoomSummary[]): RoomSummary | undefined {
  const editorial = rooms.find((room) => room.metadata.isHeadliner === true && isJoinable(room));
  if (editorial !== undefined) return editorial;

  return rooms.reduce<RoomSummary | undefined>((best, room) => {
    if (!isJoinable(room)) return best;
    return best === undefined || room.metadata.buyIn > best.metadata.buyIn ? room : best;
  }, undefined);
}

export function lobbyReadout(rooms: readonly RoomSummary[]): string {
  if (rooms.length === 0) return "No tables yet";
  const seats = rooms.reduce((total, room) => total + (room.locked ? 0 : openSeats(room)), 0);
  return `${rooms.length} live · ${seats} open ${seats === 1 ? "seat" : "seats"}`;
}

export function filterLobbyRooms(rooms: readonly RoomSummary[], filter: LobbyFilter): RoomSummary[] {
  switch (filter) {
    case "Open seats":
      return rooms.filter(isJoinable);
    case "Classic":
      return rooms.filter((room) => room.metadata.powerUps.deal === "off");
    case "Wild Power":
      return rooms.filter((room) => room.metadata.powerUps.deal !== "off");
    case "Low stakes":
      return rooms.filter((room) => room.metadata.buyIn < HIGH_STAKES_FROM);
    case "High stakes":
      return rooms.filter((room) => room.metadata.buyIn >= HIGH_STAKES_FROM);
    case "All":
      return [...rooms];
  }
}

/** Presentation only: keep the validated wire shape and never invent host/player metadata. */
export function lobbyView(
  rooms: readonly RoomSummary[],
  hostedRoomIds: ReadonlySet<string> = new Set(),
): {
  headliner: RoomSummary | undefined;
  listRooms: RoomSummary[];
  readout: string;
} {
  const headliner = pickHeadliner(rooms);
  const listRooms = rooms.filter((room) => room.roomId !== headliner?.roomId);
  const orderedRooms = listRooms
    .map((room, index) => ({ room, index }))
    .sort(
      (left, right) =>
        Number(hostedRoomIds.has(right.room.roomId)) -
          Number(hostedRoomIds.has(left.room.roomId)) ||
        left.index - right.index,
    )
    .map(({ room }) => room);

  return {
    headliner,
    listRooms: orderedRooms,
    readout: lobbyReadout(rooms),
  };
}
