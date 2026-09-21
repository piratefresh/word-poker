/**
 * rooms.ts — the table before anyone sits at it: the create options a client sends, the one
 * validator both sides run on them, and the summary the lobby lists a room under.
 *
 * A table's stakes are a fixed buy-in and a minimum bet derived from it — never blinds (§2,
 * §5, ADR 0001). The client form pre-validates with `validateRoomCreateOptions` and the server
 * refuses a create with the same function, so the two cannot disagree about what a legal table
 * is; the minimum bet is not an option at all, so no client can propose stakes §2 does not
 * offer.
 */

import { WAITING_PHASE, isRoomPhase, type RoomPhase } from "./phases";

/** The room name the server registers the felt under and the client joins. */
export const GAME_ROOM_NAME = "game";

/** The room name the server registers the lobby subscription under. */
export const LOBBY_ROOM_NAME = "lobby";

/** §2's tiers, in coins. The only buy-ins a table can be created with. */
export const BUY_IN_PRESETS = [500, 5_000, 50_000] as const;

/** One of §2's fixed buy-ins. */
export type BuyInPreset = (typeof BUY_IN_PRESETS)[number];

/** §5: a table is heads-up at its smallest. */
export const MIN_SEATS = 2;

/** §5: a table seats six at its largest. */
export const MAX_SEATS = 6;

/** §2's table name is a short label on a card; anything longer is a paste accident. */
export const ROOM_NAME_MAX_LENGTH = 32;

/**
 * The minimum bet a buy-in derives — ADR 0001's 2% ratio, so 10 / 100 / 1,000 on §2's presets.
 *
 * Written as `buyIn * 2 / 100` rather than `buyIn * 0.02`: the doubled integer divides exactly
 * on every preset, so no rounding can slip a coin between the stakes a card advertises and the
 * ones the engine enforces.
 */
export function minBetFor(buyIn: number): number {
  return (buyIn * 2) / 100;
}

/** Whether an untrusted value is one of §2's fixed buy-ins. */
export function isBuyInPreset(value: unknown): value is BuyInPreset {
  return (BUY_IN_PRESETS as readonly unknown[]).includes(value);
}

/**
 * What a client asks the server to create: a name, §2's fixed buy-in, and §5's seat cap. The
 * minimum bet is deliberately absent — it is derived from the buy-in, server-side.
 */
export interface GameRoomCreateOptions {
  readonly name: string;
  readonly buyIn: BuyInPreset;
  readonly maxSeats: number;
}

/** Which input a refusal is about, so a form can mark the field. */
export type RoomCreateField = "name" | "buyIn" | "maxSeats";

/** Why a create was refused, and the sentence a form and a server rejection both show. */
export interface RoomCreateRefusal {
  readonly field: RoomCreateField;
  readonly message: string;
}

/** A create request checked: the options as the server will store them, or the first refusal. */
export type RoomCreateValidation =
  | { readonly ok: true; readonly options: GameRoomCreateOptions }
  | { readonly ok: false; readonly refusal: RoomCreateRefusal };

/**
 * Check an untrusted create request. Runs on the client, so the form can refuse before it
 * spends a round trip, and on the server, so a hand-rolled socket cannot seat a table §2 does
 * not allow — one function, so the two answers cannot drift.
 *
 * The name is trimmed before it is measured and the trimmed name is what comes back: a name of
 * spaces is an empty name, and the server stores what the validator approved.
 */
export function validateRoomCreateOptions(value: unknown): RoomCreateValidation {
  const candidate = (value ?? {}) as Record<keyof GameRoomCreateOptions, unknown>;

  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (name.length === 0) {
    return { ok: false, refusal: { field: "name", message: "Give the table a name." } };
  }
  if (name.length > ROOM_NAME_MAX_LENGTH) {
    const message = `Table names run to ${ROOM_NAME_MAX_LENGTH} characters.`;
    return { ok: false, refusal: { field: "name", message } };
  }

  if (!isBuyInPreset(candidate.buyIn)) {
    const message = "Pick a buy-in of 500, 5,000 or 50,000 coins.";
    return { ok: false, refusal: { field: "buyIn", message } };
  }

  const maxSeats = candidate.maxSeats;
  if (
    typeof maxSeats !== "number" ||
    !Number.isInteger(maxSeats) ||
    maxSeats < MIN_SEATS ||
    maxSeats > MAX_SEATS
  ) {
    const message = `Seats take a whole number from ${MIN_SEATS} to ${MAX_SEATS}.`;
    return { ok: false, refusal: { field: "maxSeats", message } };
  }

  return { ok: true, options: { name, buyIn: candidate.buyIn, maxSeats } };
}

/**
 * What a table publishes about itself for the lobby: the config it was created with plus its
 * synced phase, so a card can show buy-in, seats and status without anyone joining it.
 *
 * `status` is the room's own phase value rather than a second enum — `WAITING_PHASE` while
 * seats are open, a round while a hand runs — so nothing has to translate between the two.
 */
export interface GameRoomMetadata {
  readonly name: string;
  readonly buyIn: BuyInPreset;
  readonly minBet: number;
  readonly maxSeats: number;
  readonly status: RoomPhase;
}

/**
 * Whether an untrusted value — a listing's metadata, read off a socket we do not control — has
 * the shape of a table's config. A listing that fails this is not a table we can describe.
 */
export function isGameRoomMetadata(value: unknown): value is GameRoomMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    isBuyInPreset(candidate.buyIn) &&
    typeof candidate.minBet === "number" &&
    typeof candidate.maxSeats === "number" &&
    isRoomPhase(candidate.status)
  );
}

/** The two states §3's browser puts on a table card. */
export type TableStatus = "waiting" | "in-hand";

/** §3's waiting / in-hand read of a table's phase. */
export function tableStatus(metadata: GameRoomMetadata): TableStatus {
  return metadata.status === WAITING_PHASE ? "waiting" : "in-hand";
}

/**
 * One table as the lobby lists it — the client's read of a matchmaking listing entry, which is
 * also where seat counts come from: the listing carries `clients` / `maxClients`, and Colyseus
 * pushes a fresh one on every join, leave, lock and metadata change.
 */
export interface RoomSummary {
  readonly roomId: string;
  readonly clients: number;
  readonly maxClients: number;
  /** A room that stopped taking joins — full, or locked outright (§3's "temporarily unavailable"). */
  readonly locked: boolean;
  readonly metadata: GameRoomMetadata;
}

/**
 * Read one untrusted listing entry — an item of the lobby's `rooms` array, or of a `+` update —
 * as a summary. Anything that is not a Word Poker table we can describe (another room type, a
 * listing without our metadata, a field of the wrong type) reads as `undefined`, so a caller
 * leaves it out of the list instead of rendering a row it cannot trust.
 */
export function roomSummaryFromListing(value: unknown): RoomSummary | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;

  const { roomId, clients, maxClients } = candidate;
  if (typeof roomId !== "string" || roomId.length === 0) return undefined;
  if (typeof clients !== "number" || typeof maxClients !== "number") return undefined;
  if (!isGameRoomMetadata(candidate.metadata)) return undefined;

  return {
    roomId,
    clients,
    maxClients,
    locked: candidate.locked === true,
    metadata: candidate.metadata,
  };
}
