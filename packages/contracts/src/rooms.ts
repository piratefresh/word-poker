/**
 * rooms.ts — the table before anyone sits at it: the create options a client sends, the one
 * validator both sides run on them, and the summary the lobby lists a room under.
 *
 * A table's stakes are a fixed buy-in and the blinds derived from it (§2, §5, ADR 0004). The
 * client form pre-validates with `validateRoomCreateOptions` and the server refuses a create
 * with the same function, so the two cannot disagree about what a legal table is; the blinds are
 * not an option at all, so no client can propose stakes §2 does not offer.
 */

import { WAITING_PHASE, isRoomPhase, type RoomPhase } from "./phases";
import {
  DEFAULT_POWER_UP_SETTINGS,
  isPowerUpSettings,
  type PowerUpSettings,
} from "./powers";

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

/** §5: a table seats four at its largest (the tabletop layout has no room for more). */
export const MAX_SEATS = 4;

/** Shared accent wheel for public room players; these colors carry no account information. */
export const LOBBY_PLAYER_COLORS = [
  "#e6b450",
  "#7ec4cf",
  "#9ec27a",
  "#a78bfa",
  "#f0a8c0",
  "#e07a5f",
  "#81b29a",
  "#a8d0f0",
] as const;

/** Public player identity for a lobby seat. `id` is a room-local seat id, not an account id. */
export interface RoomPlayerSummary {
  readonly id: string;
  readonly initial: string;
  readonly color: (typeof LOBBY_PLAYER_COLORS)[number];
}

/** Last public showdown word, safe to show on the room's headliner card. */
export interface RoomLastWord {
  readonly by: string;
  readonly word: string;
  readonly points: number;
}

/** §2's table name is a short label on a card; anything longer is a paste accident. */
export const ROOM_NAME_MAX_LENGTH = 32;

/**
 * The blinds a buy-in derives — ADR 0004's 1% / 2% ratios, so 5 / 10, 50 / 100 and 500 / 1,000 on
 * §2's presets. The big blind is the table's minimum bet (§22).
 *
 * Written as `buyIn / 100` rather than `buyIn * 0.01`: a preset is a round hundred, so both
 * divide exactly and no rounding can slip a coin between the blinds a card advertises and the
 * ones the engine enforces.
 */
export function blindsFor(buyIn: number): { smallBlind: number; bigBlind: number } {
  return { smallBlind: buyIn / 100, bigBlind: (buyIn * 2) / 100 };
}

/** Whether an untrusted value is one of §2's fixed buy-ins. */
export function isBuyInPreset(value: unknown): value is BuyInPreset {
  return (BUY_IN_PRESETS as readonly unknown[]).includes(value);
}

/**
 * What a client asks the server to create: a name, §2's fixed buy-in, §5's seat cap, and §40's
 * power-up deal mode. The blinds are deliberately absent — they are derived from the buy-in,
 * server-side.
 */
export interface GameRoomCreateOptions {
  readonly name: string;
  readonly buyIn: BuyInPreset;
  readonly maxSeats: number;
  readonly powerUps: PowerUpSettings;
}

/** Which input a refusal is about, so a form can mark the field. */
export type RoomCreateField = "name" | "buyIn" | "maxSeats" | "powerUps";

/** The one sentence a malformed power-up setting is refused with. */
const POWER_UPS_REFUSAL = "Pick Classic or Wild power-ups.";

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
 *
 * Power-ups are opt-in (§40): a request that names no `powerUps` is Classic. A setting that is
 * named has to be one the table can run, and only the keys this version knows are stored.
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

  const powerUps = candidate.powerUps === undefined ? DEFAULT_POWER_UP_SETTINGS : candidate.powerUps;
  if (!isPowerUpSettings(powerUps)) {
    return { ok: false, refusal: { field: "powerUps", message: POWER_UPS_REFUSAL } };
  }

  return {
    ok: true,
    options: { name, buyIn: candidate.buyIn, maxSeats, powerUps: { deal: powerUps.deal } },
  };
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
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly maxSeats: number;
  /** §40's deal mode, so a card and the pre-join sheet can say Classic or Wild. */
  readonly powerUps: PowerUpSettings;
  readonly status: RoomPhase;
  /** First seat's public display name. Omitted by older servers. */
  readonly hostName?: string;
  /** Public initials and colors in seat order; never includes private racks or drafts. */
  readonly players?: readonly RoomPlayerSummary[];
  /** Editorial override; otherwise the lobby chooses the highest-buy-in joinable room. */
  readonly isHeadliner?: boolean;
  /** Most recent valid winning word, if a hand has settled. */
  readonly lastWord?: RoomLastWord;
  /** Room creation time in epoch milliseconds. Omitted by older servers. */
  readonly createdAt?: number;
}

function isRoomPlayerSummary(value: unknown): value is RoomPlayerSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.initial === "string" &&
    Array.from(candidate.initial).length === 1 &&
    candidate.initial.trim().length > 0 &&
    (LOBBY_PLAYER_COLORS as readonly unknown[]).includes(candidate.color)
  );
}

function isRoomLastWord(value: unknown): value is RoomLastWord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.by === "string" &&
    candidate.by.trim().length > 0 &&
    typeof candidate.word === "string" &&
    candidate.word.trim().length > 0 &&
    typeof candidate.points === "number" &&
    Number.isInteger(candidate.points) &&
    candidate.points >= 0
  );
}

/**
 * Whether an untrusted value — a listing's metadata, read off a socket we do not control — has
 * the shape of a table's config. A listing that fails this is not a table we can describe.
 */
export function isGameRoomMetadata(value: unknown): value is GameRoomMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isBuyInPreset(candidate.buyIn)) return false;
  const blinds = blindsFor(candidate.buyIn);
  const players = candidate.players;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.smallBlind === blinds.smallBlind &&
    candidate.bigBlind === blinds.bigBlind &&
    typeof candidate.maxSeats === "number" &&
    Number.isInteger(candidate.maxSeats) &&
    candidate.maxSeats >= MIN_SEATS &&
    candidate.maxSeats <= MAX_SEATS &&
    isPowerUpSettings(candidate.powerUps) &&
    isRoomPhase(candidate.status) &&
    (candidate.hostName === undefined ||
      (typeof candidate.hostName === "string" && candidate.hostName.trim().length > 0)) &&
    (players === undefined ||
      (Array.isArray(players) &&
        players.length <= (candidate.maxSeats as number) &&
        players.every(isRoomPlayerSummary) &&
        new Set(players.map((player) => player.id)).size === players.length)) &&
    (candidate.isHeadliner === undefined || typeof candidate.isHeadliner === "boolean") &&
    (candidate.lastWord === undefined || isRoomLastWord(candidate.lastWord)) &&
    (candidate.createdAt === undefined ||
      (typeof candidate.createdAt === "number" &&
        Number.isSafeInteger(candidate.createdAt) &&
        candidate.createdAt >= 0))
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
  if (
    !Number.isInteger(clients) ||
    clients < 0 ||
    !Number.isInteger(maxClients) ||
    maxClients !== candidate.metadata.maxSeats ||
    clients > maxClients
  ) {
    return undefined;
  }

  return {
    roomId,
    clients,
    maxClients,
    locked: candidate.locked === true,
    metadata: candidate.metadata,
  };
}
