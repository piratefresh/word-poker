/**
 * The online table boundary: client messages and the server-owned state/event shapes that
 * cross a Colyseus room.
 *
 * This module intentionally contains no Colyseus imports. `apps/server` projects these
 * domain shapes into `@colyseus/schema`, while the mobile app consumes the same vocabulary
 * for its optimistic UI. A client identifies itself by the room connection, never by a
 * `playerId` in a payload.
 */

import {
  BETTING_REJECTION_REASONS,
  isBettingAction,
  type BettingAction,
  type BettingRejectionReason,
  type PayoutResult,
  type RoundChips,
  type SeatChips,
} from "./betting";
import type { RoomPhase, RoundPhase } from "./phases";
import { isBefriendAction, type BefriendAction, type BefriendResult } from "./friends";
import type { PlayerId } from "./players";
import {
  POWER_REJECTION_REASONS,
  isPowerUpId,
  type PowerRejectionReason,
  type PowerUpId,
} from "./powers";
import type { GameRoomMetadata } from "./rooms";
import type { ShowdownComparison, ShowdownStanding } from "./showdown";
import type { LetterTile, Tile } from "./tiles";
import type { TilePlay } from "./words";
import {
  WORD_REJECTION_REASONS,
  isWordSubmission,
  type PrivateWordCheckState,
  type WordRejectionReason,
  type WordSubmission,
} from "./words";

/** A betting action as sent by a client; the room supplies the seat from `client.sessionId`. */
type WithoutPlayerId<Action> = Action extends { playerId: PlayerId } ? Omit<Action, "playerId"> : never;

export type OnlineBettingAction = WithoutPlayerId<BettingAction>;

/**
 * A seat saying whether it is ready for the first hand. The waiting room deals once every seat
 * at the table (two at least) has said yes; a seat may take it back until then.
 */
export interface OnlineReadyAction {
  readonly ready: boolean;
}

/** The payload for either online word message. */
export interface OnlineWordAction {
  readonly submission: WordSubmission;
}

/**
 * The fields every power command carries (§44). `actionId` is minted by the client, once per
 * gesture, so the server can answer a retried command with the result it already gave instead of
 * acting twice. `handId` is the hand the command was meant for — the broadcast's `handCount` —
 * so a command that arrives after its hand has ended is refused rather than landing on the next.
 */
interface OnlinePowerCommand {
  readonly actionId: string;
  readonly handId: number;
  readonly powerUpId: PowerUpId;
}

/** A seat keeping one of the powers the Power Draw offered it. */
export type OnlinePickPowerAction = OnlinePowerCommand;

/** A seat using its held power on one of its private tiles (the swap family's target). */
export interface OnlineUsePowerUpAction extends OnlinePowerCommand {
  readonly tileId: string;
}

/** The longest `actionId` the server keeps: a client id is a short token, not a payload. */
export const POWER_ACTION_ID_MAX_LENGTH = 64;

/**
 * Colyseus message names and their payloads. The values are kept as strings because the SDK
 * sends messages by name; `GameMessageMap` is the type-level name -> payload map both sides
 * use to register handlers.
 */
export interface GameMessageMap {
  readonly befriend: BefriendAction;
  readonly betting: OnlineBettingAction;
  readonly checkWord: OnlineWordAction;
  readonly draftWord: OnlineWordAction;
  readonly confirmWord: OnlineWordAction;
  readonly ready: OnlineReadyAction;
  /** A seat has put away the paid-out hand's results; carries no payload. */
  readonly resultsSeen: undefined;
  readonly pickPower: OnlinePickPowerAction;
  readonly usePowerUp: OnlineUsePowerUpAction;
}

export const GAME_MESSAGES = {
  befriend: "befriend",
  betting: "betting",
  checkWord: "checkWord",
  draftWord: "draftWord",
  confirmWord: "confirmWord",
  ready: "ready",
  resultsSeen: "resultsSeen",
  pickPower: "pickPower",
  usePowerUp: "usePowerUp",
} as const satisfies { [Name in keyof GameMessageMap]: Name };

export type GameMessageName = keyof GameMessageMap;
export type GameMessagePayload<Name extends GameMessageName = GameMessageName> = GameMessageMap[Name];

/** The server-to-client messages that are not represented by synchronized room state. */
export interface GameEventMap {
  readonly befriendResult: BefriendResult;
  /** Targeted to one connection; never put a private rack in the broadcast schema. */
  readonly privateState: PrivateSeatState;
  /** Targeted to the sender that submitted an invalid or illegal action. */
  readonly rejected: GameRejectionEvent;
  /** Targeted to one seat: the powers it is offered at this hand's Power Draw. */
  readonly powerDraw: PrivatePowerDraw;
  /** Targeted to the seat that used a swap power: the tile it lost and the one it received. */
  readonly powerSwap: PrivatePowerSwap;
  /** Broadcast: a seat used a power. It never says what the power gave. */
  readonly powerUsed: PowerUsedEvent;
}

export const GAME_EVENTS = {
  befriendResult: "befriendResult",
  privateState: "privateState",
  rejected: "rejected",
  powerDraw: "powerDraw",
  powerSwap: "powerSwap",
  powerUsed: "powerUsed",
} as const satisfies { [Name in keyof GameEventMap]: Name };

/**
 * One seat's Power Draw (§44). Private: no other seat learns what it was offered. `now` rides
 * along, as on the word window, so the client counts down without trusting its own clock.
 */
export interface PrivatePowerDraw {
  readonly handId: number;
  /** In the order drawn; the first is what the seat keeps if the clock runs out. */
  readonly offers: readonly PowerUpId[];
  readonly now: number;
  /** Epoch milliseconds on the server when the draw closes. */
  readonly deadline: number;
}

/**
 * The result of a swap power, sent only to the seat that used it (§44: the result is private).
 * The new tile is always a plain letter — no multiplier, never a choice tile.
 */
export interface PrivatePowerSwap {
  readonly handId: number;
  readonly powerUpId: PowerUpId;
  readonly discardedTileId: string;
  readonly tile: LetterTile;
}

/**
 * The public side of a power (§44): who used which power, on which street. The word window sits
 * inside the river, so a power used there reports `river`.
 */
export interface PowerUsedEvent {
  readonly handId: number;
  readonly seat: number;
  readonly powerUpId: PowerUpId;
  readonly street: Exclude<RoundPhase, "payout">;
  /** Spotlight only: the community tile it lit, and what it prints ("A", or a choice tile's "A/E"). */
  readonly tileId?: string;
  readonly letter?: string;
}

/** A rejection associated with the message family that produced it. */
export type GameRejectionEvent =
  | {
      readonly action: "betting";
      readonly reason: BettingRejectionReason;
    }
  | {
      readonly action: "draftWord" | "confirmWord";
      readonly reason: WordRejectionReason;
    }
  | {
      readonly action: "pickPower" | "usePowerUp";
      readonly reason: PowerRejectionReason;
      /** The refused command's own id, so the client can tell which gesture was refused. */
      readonly actionId: string;
    };

/** One public seat in the broadcast snapshot. */
export interface OnlineSeatState extends SeatChips {
  /** Stable position in the room; it is not a wallet or account id. */
  readonly seat: number;
  readonly playerId: PlayerId;
  readonly connected: boolean;
  /** A busted seat remains in the table projection but is not dealt into the hand. */
  readonly sittingOut: boolean;
  /** Whether this seat has acted since the last full raise. */
  readonly actedThisRound: boolean;
  /** Said ready in the waiting room; cleared whenever the table goes back to waiting. */
  readonly ready: boolean;
  /** This seat chose Play another and left the settled results. */
  readonly seenResults: boolean;
  /** A dropped connection still holds its seat; a departed player does not. */
  readonly present: boolean;
}

/** One live pot layer, with player ids rather than the engine's private seat indexes. */
export interface OnlinePot {
  readonly amount: number;
  readonly eligible: readonly PlayerId[];
}

/** The public portion of one seat's word-window slot. Its text stays private until reveal. */
export type OnlineWordSlot =
  | { readonly playerId: PlayerId; readonly status: "drafting" }
  | { readonly playerId: PlayerId; readonly status: "confirmed" }
  | { readonly playerId: PlayerId; readonly status: "timed-out" };

/**
 * The shared word window. `now` is repeated here so a consumer can handle the shape as a
 * standalone event without comparing the deadline to its own device clock.
 */
export interface OnlineWordWindow {
  readonly status: "open" | "settled";
  readonly now: number;
  readonly deadline: number;
  readonly slots: readonly OnlineWordSlot[];
}

/** A table's immutable configuration as projected into the room state. */
export type GameTableConfig = Omit<GameRoomMetadata, "status">;

/** A public showdown standing enriched with the resolved word and refusal reason. */
export interface OnlineStanding extends ShowdownStanding {
  readonly word: string | null;
  readonly reason: WordRejectionReason | null;
  /**
   * The reveal (§20): the physical tiles the seat played, in word order — public once the hand
   * pays out, and empty when no word stood. Private tiles never enter the broadcast before this.
   */
  readonly tiles: readonly Tile[];
  /** §7's parts of `score`: printed values, what the multipliers added, the Full Rack Bonus. */
  readonly base: number;
  readonly mult: number;
  readonly rack: number;
}

/** The public result retained after the hand reaches payout. */
export interface OnlineHandResult {
  readonly standings: readonly OnlineStanding[];
  readonly comparisons: readonly ShowdownComparison[];
  readonly winner: PlayerId;
  readonly payout: PayoutResult;
}

/**
 * The complete broadcast snapshot. Community tiles must already be sliced to the current
 * street's revealed count before they are assigned here; the raw five-tile board is never a
 * valid public state during preflop, flop, or turn.
 */
export interface GameTableState {
  readonly now: number;
  readonly table: GameTableConfig;
  readonly phase: RoomPhase;
  readonly sessionOver: boolean;
  readonly handCount: number;
  readonly dealerSeat: number | null;
  readonly toActSeat: number | null;
  /** Epoch milliseconds on the server; zero when no betting turn is open. */
  readonly turnDeadline: number;
  readonly seats: readonly OnlineSeatState[];
  readonly betting: RoundChips | null;
  readonly pots: readonly OnlinePot[];
  readonly community: readonly Tile[];
  readonly wordWindow: OnlineWordWindow | null;
  readonly result: OnlineHandResult | null;
}

/** The current seat's private rack and word state, sent only to that connection. */
export interface PrivateSeatState {
  readonly now: number;
  readonly playerId: PlayerId;
  readonly seat: number;
  readonly tableStack: number;
  /**
   * The hand this rack was dealt for — the broadcast's `handCount`, zero before the first deal.
   * The message outruns the patch that deals the board, so a client pairs a rack only with the
   * board of the same hand.
   */
  readonly hand: number;
  readonly rack: readonly Tile[];
  readonly word: PrivateWordState;
  readonly wordCheck: PrivateWordCheckState;
  readonly isYourTurn: boolean;
  /** Epoch milliseconds on the server; zero when this seat has no betting turn. */
  readonly turnDeadline: number;
  /**
   * The seat's side of a Wild table's hand (§44) — what a reconnect restores. Absent at a Classic
   * table, before the first deal, and for a seat that is not in the hand's draw.
   */
  readonly power?: PrivatePowerState;
}

/**
 * One seat's power-ups for one hand, private to that seat: what it was offered, what it kept,
 * whether it can use it right now (the engine's answer), and what its swap did.
 */
export interface PrivatePowerState {
  readonly handId: number;
  /** The seat's Power Draw while it is open; `null` once it has closed. */
  readonly draw: {
    readonly offers: readonly PowerUpId[];
    readonly picked: PowerUpId | null;
    /** Epoch milliseconds on the server when the draw closes. */
    readonly deadline: number;
  } | null;
  /** The power the seat kept, once the draw has given it one. */
  readonly held: {
    readonly powerUpId: PowerUpId;
    readonly used: boolean;
    /** Whether the seat may use it right now: its own turn, or §19's window before it confirms. */
    readonly usable: boolean;
  } | null;
  readonly swap: PrivatePowerSwap | null;
  /**
   * River Review (§44): the seat's best words once the hand has paid out, best first. Absent until
   * then and for any other power; riding on the private state means a reconnect restores it.
   */
  readonly review?: readonly RiverReviewWord[];
}

/** One word River Review shows: the word, what it scores, and the tiles that play it, in order. */
export interface RiverReviewWord {
  readonly word: string;
  readonly score: number;
  readonly plays: readonly TilePlay[];
}

/** The private draft/confirmation record a seat restores after a reconnect. */
export interface PrivateWordState {
  /** `none`: no word window has opened yet, or the seat is not in the hand. */
  readonly status: "none" | "drafting" | "confirmed" | "timed-out";
  readonly draft: WordSubmission | null;
  readonly confirmed: WordSubmission | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural validation for a client betting payload. The existing betting validator remains
 * the authority for action kinds and amounts; the synthetic id only adapts that offline shape
 * to the connection-owned online shape.
 */
export function isOnlineBettingAction(value: unknown): value is OnlineBettingAction {
  if (!isRecord(value) || "playerId" in value) return false;
  return isBettingAction({ ...value, playerId: "online-seat" });
}

/** Structural validation for a client word payload. */
export function isOnlineWordAction(value: unknown): value is OnlineWordAction {
  return isRecord(value) && !("playerId" in value) && isWordSubmission(value.submission);
}

/** Structural validation for a client ready payload. */
export function isOnlineReadyAction(value: unknown): value is OnlineReadyAction {
  return isRecord(value) && typeof value.ready === "boolean";
}

function isOnlinePowerCommand(value: unknown): value is OnlinePowerCommand {
  return (
    isRecord(value) &&
    !("playerId" in value) &&
    typeof value.actionId === "string" &&
    value.actionId.length > 0 &&
    value.actionId.length <= POWER_ACTION_ID_MAX_LENGTH &&
    typeof value.handId === "number" &&
    Number.isSafeInteger(value.handId) &&
    value.handId > 0 &&
    isPowerUpId(value.powerUpId)
  );
}

/** Structural validation for a client Power Draw pick. */
export function isOnlinePickPowerAction(value: unknown): value is OnlinePickPowerAction {
  return isOnlinePowerCommand(value);
}

/** Structural validation for a client power use; the engine decides whether it is legal. */
export function isOnlineUsePowerUpAction(value: unknown): value is OnlineUsePowerUpAction {
  return (
    isRecord(value) &&
    typeof value.tileId === "string" &&
    value.tileId.length > 0 &&
    isOnlinePowerCommand(value)
  );
}

/** Runtime dispatch validation for the typed Colyseus message map. */
export function isGameMessagePayload<Name extends GameMessageName>(
  name: Name,
  value: unknown,
): value is GameMessageMap[Name] {
  switch (name) {
    case "befriend":
      return isBefriendAction(value);
    case "betting":
      return isOnlineBettingAction(value);
    case "checkWord":
    case "draftWord":
    case "confirmWord":
      return isOnlineWordAction(value);
    case "ready":
      return isOnlineReadyAction(value);
    case "resultsSeen":
      return value === undefined;
    case "pickPower":
      return isOnlinePickPowerAction(value);
    case "usePowerUp":
      return isOnlineUsePowerUpAction(value);
    default:
      return false;
  }
}

/** Runtime validation for rejection events received by a client. */
export function isGameRejectionEvent(value: unknown): value is GameRejectionEvent {
  if (!isRecord(value) || typeof value.action !== "string" || typeof value.reason !== "string") {
    return false;
  }

  if (value.action === "betting") {
    return (BETTING_REJECTION_REASONS as readonly unknown[]).includes(value.reason);
  }

  if (value.action === "draftWord" || value.action === "confirmWord") {
    return (WORD_REJECTION_REASONS as readonly unknown[]).includes(value.reason);
  }

  if (value.action === "pickPower" || value.action === "usePowerUp") {
    return (
      typeof value.actionId === "string" &&
      (POWER_REJECTION_REASONS as readonly unknown[]).includes(value.reason)
    );
  }

  return false;
}
