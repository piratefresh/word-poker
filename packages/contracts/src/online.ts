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
import type { RoomPhase } from "./phases";
import type { PlayerId } from "./players";
import type { GameRoomMetadata } from "./rooms";
import type { ShowdownComparison, ShowdownStanding } from "./showdown";
import type { Tile } from "./tiles";
import {
  WORD_REJECTION_REASONS,
  isWordSubmission,
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
 * Colyseus message names and their payloads. The values are kept as strings because the SDK
 * sends messages by name; `GameMessageMap` is the type-level name -> payload map both sides
 * use to register handlers.
 */
export interface GameMessageMap {
  readonly betting: OnlineBettingAction;
  readonly draftWord: OnlineWordAction;
  readonly confirmWord: OnlineWordAction;
  readonly ready: OnlineReadyAction;
}

export const GAME_MESSAGES = {
  betting: "betting",
  draftWord: "draftWord",
  confirmWord: "confirmWord",
  ready: "ready",
} as const satisfies { [Name in keyof GameMessageMap]: Name };

export type GameMessageName = keyof GameMessageMap;
export type GameMessagePayload<Name extends GameMessageName = GameMessageName> = GameMessageMap[Name];

/** The server-to-client messages that are not represented by synchronized room state. */
export interface GameEventMap {
  /** Targeted to one connection; never put a private rack in the broadcast schema. */
  readonly privateState: PrivateSeatState;
  /** Targeted to the sender that submitted an invalid or illegal action. */
  readonly rejected: GameRejectionEvent;
}

export const GAME_EVENTS = {
  privateState: "privateState",
  rejected: "rejected",
} as const satisfies { [Name in keyof GameEventMap]: Name };

/** A rejection associated with the message family that produced it. */
export type GameRejectionEvent =
  | {
      readonly action: "betting";
      readonly reason: BettingRejectionReason;
    }
  | {
      readonly action: "draftWord" | "confirmWord";
      readonly reason: WordRejectionReason;
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
  readonly isYourTurn: boolean;
  /** Epoch milliseconds on the server; zero when this seat has no betting turn. */
  readonly turnDeadline: number;
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

/** Runtime dispatch validation for the typed Colyseus message map. */
export function isGameMessagePayload<Name extends GameMessageName>(
  name: Name,
  value: unknown,
): value is GameMessageMap[Name] {
  switch (name) {
    case "betting":
      return isOnlineBettingAction(value);
    case "draftWord":
    case "confirmWord":
      return isOnlineWordAction(value);
    case "ready":
      return isOnlineReadyAction(value);
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

  return false;
}
