/**
 * parlor-view.ts — the listing as The Parlor draws it: the table the hero card features, the rest
 * as rows, and the three numbers on the rail.
 *
 * All of it is derived from what the lobby subscription carries and nothing else. A listing says
 * what a table is (its name, its fixed buy-in, the opening bet it derives, its seat cap), what
 * state it is in (§3's waiting / in hand), and how many seats are taken of how many it has —
 * because that is what a browser needs to offer a seat. It deliberately does not carry a pot, the
 * players in it, or the word last played: those belong to the hand, and the lobby is not in it.
 * The rail is the lobby's own numbers, plus the Wallet's coins when the app has read them.
 *
 * Every function here is pure: the screen's lists and figures are a fold over the last listing
 * the server pushed, so a seat taken by someone else redraws the hero, the rail and the rows in
 * the same pass, and the same listing always draws the same screen.
 */

import { tableStatus, type RoomSummary, type TableStatus } from "@wordpoker/contracts";

import { formatAmount, formatCoins } from "@/lib/ui/format";
import { powersLabel } from "@/features/table/power-view";
import { isJoinable, openSeats } from "@/features/online/lobby-view";

export { isJoinable, openSeats } from "@/features/online/lobby-view";

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
}

export interface ParlorView {
  readonly featured: FeaturedTable | null;
  /** Every listed table but the featured one, in the server's own order. */
  readonly others: RoomSummary[];
  readonly stats: ParlorStat[];
}

/**
 * Where a Join control stands (design 1a, Flow A). Your own seat comes first — a full table you
 * are sitting at is the table you are sitting at — then a join in the air, then §3's refusals.
 */
export type JoinKind = "yours" | "joining" | "guest" | "locked" | "full" | "short" | "open";

export interface JoinContext {
  readonly yours?: boolean;
  readonly joining?: boolean;
  /** A guest has no Wallet, so no table takes them (STO-953 draws the panel that says so). */
  readonly guest?: boolean;
  /** The Wallet's coins; `null` while unread, which leaves affording to the server to judge. */
  readonly coins?: number | null;
}

/** What a Join control says on each surface, and whether it does anything. */
export interface JoinOffer {
  readonly kind: JoinKind;
  readonly enabled: boolean;
  /** The big button's words. The `open` button draws `JOIN`, a coin, then `price`. */
  readonly label: string;
  readonly price: string | null;
  /** The right-hand label on a table row. */
  readonly rowLabel: string;
  /** The button's screen-reader sentence. */
  readonly spoken: string;
}

export function joinKind(room: RoomSummary, { yours, joining, guest, coins = null }: JoinContext): JoinKind {
  if (yours) return "yours";
  if (joining) return "joining";
  if (guest) return "guest";
  if (room.locked) return "locked";
  if (room.clients >= room.maxClients) return "full";
  if (coins !== null && coins < room.metadata.buyIn) return "short";
  return "open";
}

export function joinOffer(room: RoomSummary, context: JoinContext): JoinOffer {
  const kind = joinKind(room, context);
  const coins = context.coins ?? null;
  const name = room.metadata.name;
  const buyIn = room.metadata.buyIn;
  const price = formatCoins(buyIn);
  const shortfall = formatCoins(buyIn - (coins ?? 0));
  const offer = (enabled: boolean, label: string, rowLabel: string, spoken: string): JoinOffer => ({
    kind, enabled, label, price: kind === "open" ? price : null, rowLabel, spoken,
  });

  switch (kind) {
    case "yours":
      return offer(true, "BACK TO YOUR SEAT", "YOUR SEAT", `Back to your seat at ${name}.`);
    case "joining":
      return offer(false, "TAKING YOUR SEAT ···", `JOIN · ${price}`, `Taking your seat at ${name}.`);
    case "guest":
      return offer(false, "ACCOUNT NEEDED", "ACCOUNT NEEDED", "Join unavailable, online tables need an account.");
    case "locked":
      return offer(false, "LOCKED", "LOCKED", "Join unavailable, this table is locked.");
    case "full":
      return offer(false, "TABLE FULL", "FULL", "Join unavailable, this table is full.");
    case "short":
      return offer(
        false,
        `NEED ${shortfall} MORE COINS`,
        `NEED ${shortfall} MORE`,
        `Join unavailable. You need ${price} coins and have ${formatCoins(coins ?? 0)}.`,
      );
    case "open":
      return offer(
        true,
        "JOIN",
        `JOIN · ${price}`,
        `Join ${name} for ${price} coins.${coins === null ? "" : ` You have ${formatCoins(coins)} coins.`}`,
      );
  }
}

/**
 * The line under a Join button. The hero card shows the Wallet moving; the details sheet says what
 * the coins become (§4) and when they come back (§5). `elsewhere` is the table a full one points to.
 */
export function joinNote(
  room: RoomSummary,
  context: JoinContext,
  surface: "card" | "sheet",
  elsewhere: RoomSummary | null = null,
): string | null {
  const coins = context.coins ?? null;
  const buyIn = room.metadata.buyIn;

  switch (joinKind(room, context)) {
    case "open":
      return surface === "card" && coins !== null
        ? `Wallet ${formatCoins(coins)} → ${formatCoins(coins - buyIn)} coins`
        : `${formatCoins(buyIn)} coins become chips at this table. Whatever is left comes back as coins when you leave.`;
    case "short":
      return `You have ${formatCoins(coins ?? 0)} coins. This table takes ${formatCoins(buyIn)}.`;
    case "joining":
      return `Moving ${formatCoins(buyIn)} coins to the table`;
    case "full": {
      if (elsewhere === null) return "A seat opens when someone leaves.";
      const seats = openSeats(elsewhere);
      return `A seat opens when someone leaves. ${elsewhere.metadata.name} has ${seats} free ${seats === 1 ? "seat" : "seats"}.`;
    }
    default:
      return null;
  }
}

/** The cheapest table with a seat the Wallet covers — where a full or unaffordable table points. */
export function tableThatFits(
  rooms: readonly RoomSummary[],
  coins: number | null,
  except: string | null = null,
): RoomSummary | null {
  const fits = rooms.filter(
    (room) => room.roomId !== except && joinKind(room, { coins }) === "open",
  );
  return fits.reduce<RoomSummary | null>(
    (best, room) => (best === null || room.metadata.buyIn < best.metadata.buyIn ? room : best),
    null,
  );
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
  /** The Wallet's coins (STO-525); `null` while there is none to show — no chip then. */
  coins: number | null = null,
): ParlorStat[] {
  const waiting = rooms.filter((room) => tableStatus(room.metadata) === "waiting").length;
  const inHand = rooms.length - waiting;
  const free = rooms.reduce((total, room) => total + (room.locked ? 0 : openSeats(room)), 0);
  const full = rooms.filter((room) => !isJoinable(room)).length;

  const stats: ParlorStat[] = [];
  const yours = rooms.find((room) => room.roomId === activeRoomId);

  if (coins !== null) {
    stats.push({
      key: "wallet",
      label: "WALLET",
      value: formatCoins(coins),
      sub: "coins",
      accent: yours === undefined,
    });
  }

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
      accent: yours === undefined && coins === null,
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
  coins: number | null = null,
): ParlorView {
  const featured = featuredTable(rooms, activeRoomId);

  return {
    featured,
    others:
      featured === null ? [...rooms] : rooms.filter((room) => room.roomId !== featured.room.roomId),
    stats: parlorStats(rooms, activeRoomId, coins),
  };
}
