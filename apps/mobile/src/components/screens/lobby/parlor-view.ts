/**
 * parlor-view.ts — the listing as The Parlor draws it: the table the hero card features, the rest
 * as rows, and the three numbers on the rail.
 *
 * All of it is derived from what the lobby subscription carries and nothing else. A listing says
 * what a table is (its name, its fixed buy-in, the opening bet it derives, its seat cap), what
 * state it is in (§3's waiting / in hand), and how many seats are taken of how many it has —
 * because that is what a browser needs to offer a seat. It deliberately does not carry a pot, the
 * players in it, or the word last played: those belong to the hand, and the lobby is not in it.
 * The rail is therefore the lobby's own numbers rather than a wallet's — no balance is wired into
 * the app yet, and a rail that invented one would be the only figure on screen that lies.
 *
 * Every function here is pure: the screen's lists and figures are a fold over the last listing
 * the server pushed, so a seat taken by someone else redraws the hero, the rail and the rows in
 * the same pass, and the same listing always draws the same screen.
 */

import { tableStatus, type RoomSummary, type TableStatus } from "@wordpoker/contracts";

import { formatAmount } from "@/lib/format";
import { powersLabel } from "@/features/table/power-view";

/** One chip on the rail: a label, its figure, and the line under it. */
export interface ParlorStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  /** The chip the eye lands on first — the seat you hold, or the size of the room. */
  readonly accent: boolean;
}

/** What the hero card offers: the featured table's terms and the one thing its button does. */
export interface FeaturedTable {
  readonly room: RoomSummary;
  /** The seat this device holds at this table — the card is then the way back to it. */
  readonly yours: boolean;
  readonly status: TableStatus;
  readonly openSeats: number;
  readonly action: { readonly label: string; readonly enabled: boolean };
}

export interface ParlorView {
  readonly featured: FeaturedTable | null;
  /** Every listed table but the featured one, in the server's own order. */
  readonly others: RoomSummary[];
  readonly stats: ParlorStat[];
}

/**
 * Seats still free at a table. Clamped at zero because a listing can, for the instant between a
 * seat being taken and the room publishing its new cap, report more clients than its cap allows —
 * and a `-1` beside "seats open" is a figure no player can act on.
 */
export function openSeats(room: RoomSummary): number {
  return Math.max(0, room.maxClients - room.clients);
}

/** Whether a seat at this table can be taken right now. */
export function isJoinable(room: RoomSummary): boolean {
  return !room.locked && room.clients < room.maxClients;
}

/**
 * What the featured table's button says and whether it does anything. §3's Join rules decide the
 * disabled cases: full, or temporarily unavailable. Your own seat is never disabled — a full table
 * you are sitting at is the table you are sitting at.
 */
export function featuredAction(
  room: RoomSummary,
  yours: boolean,
): { label: string; enabled: boolean } {
  if (yours) return { label: "BACK TO YOUR SEAT", enabled: true };
  if (room.locked) return { label: "UNAVAILABLE", enabled: false };
  if (room.clients >= room.maxClients) return { label: "TABLE FULL", enabled: false };
  if (openSeats(room) === 1) return { label: "TAKE THE LAST SEAT", enabled: true };
  return { label: "TAKE A SEAT", enabled: true };
}

/**
 * The table as a sentence — the one description of it a screen reader gets, whether it is read off
 * a row or off the hero card's button, and the one Maestro matches a table by. It says what the
 * table is, what state it is in, and what taking it would do.
 */
export function spokenTable(room: RoomSummary, yours = false): string {
  const status =
    tableStatus(room.metadata) === "waiting" ? "waiting for players" : "a hand in play";
  const powers = powersLabel(room.metadata.powerUps);
  const table = `${room.metadata.name}, ${formatAmount(room.metadata.buyIn)} buy-in, blinds ${formatAmount(room.metadata.smallBlind)} and ${formatAmount(room.metadata.bigBlind)}, ${room.clients} of ${room.maxClients} seats taken, ${status}${powers === null ? "" : `, ${powers}`}`;
  if (yours) return `Your table, ${table}`;
  if (room.clients >= room.maxClients) return `Full table, ${table}`;
  if (room.locked) return `Unavailable table, ${table}`;
  return `Join ${table}`;
}

/**
 * How loudly a table asks for the hero card, lowest first:
 *
 *   0. a hand in play you can sit at — the table the other players are already at
 *   1. a table still waiting you can sit at
 *   2. anything else — full, or temporarily unavailable
 *
 * Inside a band the fuller table wins (the fewest seats left is the one about to start), then the
 * richer one (§2's buy-in is the stakes a player picks by), and the room id last so two tables that
 * look alike cannot trade places between pushes — a hero card that swapped on every listing update
 * would be a card nobody could aim at.
 */
function band(room: RoomSummary): number {
  if (!isJoinable(room)) return 2;
  return tableStatus(room.metadata) === "in-hand" ? 0 : 1;
}

function compare(a: RoomSummary, b: RoomSummary): number {
  const byBand = band(a) - band(b);
  if (byBand !== 0) return byBand;

  const bySeats = openSeats(a) - openSeats(b);
  if (bySeats !== 0) return bySeats;

  const byStakes = b.metadata.buyIn - a.metadata.buyIn;
  if (byStakes !== 0) return byStakes;

  return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
}

/** The table the hero card features — the liveliest seat on offer, or nothing when none is listed. */
export function featuredTable(
  rooms: readonly RoomSummary[],
  activeRoomId: string | null,
): FeaturedTable | null {
  if (rooms.length === 0) return null;

  const [room] = [...rooms].sort(compare);
  const yours = room.roomId === activeRoomId;

  return {
    room,
    yours,
    status: tableStatus(room.metadata),
    openSeats: openSeats(room),
    action: featuredAction(room, yours),
  };
}

/**
 * The rail: the seat you hold if you hold one, then the room's own size, the seats still free in
 * it, and how many of its tables are in a hand. Counts are read off the listing, so a table that
 * fills or closes moves them as it happens.
 */
export function parlorStats(
  rooms: readonly RoomSummary[],
  activeRoomId: string | null,
): ParlorStat[] {
  const waiting = rooms.filter((room) => tableStatus(room.metadata) === "waiting").length;
  const inHand = rooms.length - waiting;
  const free = rooms.reduce((total, room) => total + (room.locked ? 0 : openSeats(room)), 0);
  const full = rooms.filter((room) => !isJoinable(room)).length;

  const stats: ParlorStat[] = [];
  const yours = rooms.find((room) => room.roomId === activeRoomId);

  if (yours !== undefined) {
    const waitingHere = tableStatus(yours.metadata) === "waiting";
    stats.push({
      key: "yours",
      label: "YOUR SEAT",
      value: yours.metadata.name,
      sub: waitingHere ? "waiting for players" : "a hand in play",
      accent: true,
    });
  }

  stats.push(
    {
      key: "tables",
      label: "TABLES",
      value: String(rooms.length),
      sub: waiting === 1 ? "1 waiting" : `${waiting} waiting`,
      accent: yours === undefined,
    },
    {
      key: "seats",
      label: "SEATS OPEN",
      value: String(free),
      sub: full === 0 ? "none full" : full === 1 ? "1 table full" : `${full} tables full`,
      accent: false,
    },
    {
      key: "in-hand",
      label: "IN HAND",
      value: String(inHand),
      sub: inHand === 1 ? "hand running" : "hands running",
      accent: false,
    },
  );

  return stats;
}

/** The screen's own read of the listing: the hero, the rows under it, and the rail above them. */
export function parlorView(
  rooms: readonly RoomSummary[],
  activeRoomId: string | null,
): ParlorView {
  const featured = featuredTable(rooms, activeRoomId);

  return {
    featured,
    others:
      featured === null ? [...rooms] : rooms.filter((room) => room.roomId !== featured.room.roomId),
    stats: parlorStats(rooms, activeRoomId),
  };
}
