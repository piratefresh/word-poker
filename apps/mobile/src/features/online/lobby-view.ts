import type { RoomSummary } from "@wordpoker/contracts";

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

/** Highest buy-in with an available seat; ties keep the server's order. */
export function pickHeadliner(rooms: readonly RoomSummary[]): RoomSummary | undefined {
  // The current wire contract has no editorial headliner flag (STO-689).
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

/** Presentation only: keep the validated wire shape and never invent host/player metadata. */
export function lobbyView(rooms: readonly RoomSummary[]): {
  headliner: RoomSummary | undefined;
  listRooms: RoomSummary[];
  readout: string;
} {
  const headliner = pickHeadliner(rooms);
  return {
    headliner,
    listRooms: rooms.filter((room) => room.roomId !== headliner?.roomId),
    readout: lobbyReadout(rooms),
  };
}
