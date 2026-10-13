import type { OfflineAction } from "./actions";
import { isBettingAction } from "./betting";
import { isDictionaryId, type DictionaryId } from "./dictionaries";
import { isPowerUpDealMode, isPowerUpId, type PowerUpDealMode } from "./powers";
import { MAX_SEATS, MIN_SEATS } from "./rooms";
import type { Tile } from "./tiles";
import { isWordSubmission, WORD_REJECTION_REASONS, type WordRejectionReason, type WordSubmission } from "./words";

export const HAND_RECORD_VERSION = 1;
export const HAND_RECORD_MAX_BYTES = 512 * 1024;
export const HAND_RECORD_MAX_ACTIONS = 4096;
export const HAND_RECORD_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export type HistoryMode = "online" | "offline";
export type RecordedHandAction = Exclude<OfflineAction, { type: "deal" }>;

export interface HandRecordSeat {
  readonly playerId: string;
  /** Verified by the server for online seats; null for CPU seats. Never upload authority. */
  readonly userId: string | null;
  readonly name: string;
  readonly initialStack: number;
}

export interface HandRecordConfig {
  /** Display metadata; replay does not depend on the room's title. */
  readonly tableName?: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly turnDurationMs: number;
  readonly autoSubmitDrafts: boolean;
  readonly powerUpDeal: PowerUpDealMode;
}

export interface HandRecordAction {
  /** Contiguous, zero-based order; timestamps alone do not establish order. */
  readonly sequence: number;
  readonly atMs: number;
  readonly source: "player" | "bot" | "timeout" | "disconnect";
  readonly action: RecordedHandAction;
}

export interface HandRecordStanding {
  readonly playerId: string;
  readonly privateTiles: readonly Tile[];
  readonly submission: WordSubmission | null;
  readonly word: string | null;
  readonly score: number;
  readonly reason: WordRejectionReason | null;
  readonly place: number | null;
  readonly finalStack: number;
}

/** Canonical display snapshot, derived by the authority/replay, never trusted from an upload. */
export interface HandRecordSummary {
  readonly outcome: "fold-out" | "showdown";
  readonly community: readonly Tile[];
  readonly seats: readonly HandRecordStanding[];
  readonly pots: readonly {
    readonly amount: number;
    readonly eligible: readonly string[];
    readonly winners: readonly string[];
  }[];
}

/** Immutable replay inputs for one hand, independent of earlier hands in its session. */
export interface HandRecord {
  readonly version: typeof HAND_RECORD_VERSION;
  /** Opaque UUID, minted once at session creation. */
  readonly sessionId: string;
  readonly handNo: number;
  readonly mode: HistoryMode;
  readonly ranked: boolean;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly seed: number;
  readonly dealerSeat: number;
  readonly rulesVersion: string;
  readonly dictionaryId: DictionaryId;
  /** Lowercase SHA-256 of the exact dictionary artifact. */
  readonly dictionaryFingerprint: string;
  readonly config: HandRecordConfig;
  /** Array order is the initial seat order, including sitting-out seats. */
  readonly seats: readonly HandRecordSeat[];
  readonly actions: readonly HandRecordAction[];
  readonly summary: HandRecordSummary;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function timestamp(value: unknown): value is number {
  return integer(value, 8_640_000_000_000_000);
}

function submission(value: unknown): value is WordSubmission {
  return isWordSubmission(value) && value.plays.length <= 32 && value.plays.every(
    // Invalid confirmations still change engine state and must remain replayable.
    (play) => text(play.tileId) && (play.chosenFace === undefined || play.chosenFace.length <= 32),
  );
}

function tile(value: unknown): value is Tile {
  if (!object(value) || !text(value.id) || typeof value.letter !== "string" ||
      !/^[A-Z]$/.test(value.letter) || !integer(value.points, 100)) return false;
  if (value.multiplier !== undefined && value.multiplier !== "double-letter" && value.multiplier !== "triple-letter") return false;
  return value.alternativeLetter === undefined
    ? value.alternativePoints === undefined
    : typeof value.alternativeLetter === "string" && /^[A-Z]$/.test(value.alternativeLetter) && integer(value.alternativePoints, 100);
}

function action(value: unknown): value is RecordedHandAction {
  if (!object(value) || !text(value.type, 32)) return false;
  if (isBettingAction(value)) return text(value.playerId);
  switch (value.type) {
    case "timeoutTurn":
    case "foldTurn":
    case "timeoutWords":
    case "timeoutPowerDraw":
      return true;
    case "checkWord":
    case "draftWord":
    case "confirmWord":
      return text(value.playerId) && submission(value.submission);
    case "pickPower":
      return text(value.playerId) && isPowerUpId(value.powerUpId);
    case "usePowerUp":
      return text(value.playerId) && isPowerUpId(value.powerUpId) && text(value.tileId);
    default:
      return false;
  }
}

function ids(value: unknown, seats: ReadonlySet<string>): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= seats.size &&
    value.every((id) => typeof id === "string" && seats.has(id)) && new Set(value).size === value.length;
}

/** Shape/bounds only. Replay must prove legality and derive the canonical result (STO-454). */
export function isHandRecord(value: unknown): value is HandRecord {
  if (!object(value) || value.version !== HAND_RECORD_VERSION || typeof value.sessionId !== "string" ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.sessionId) ||
      !integer(value.handNo, 2_147_483_647) || value.handNo === 0 ||
      (value.mode !== "online" && value.mode !== "offline") || typeof value.ranked !== "boolean" ||
      (value.mode === "offline" && value.ranked) ||
      !timestamp(value.startedAtMs) || !timestamp(value.endedAtMs) || value.endedAtMs < value.startedAtMs ||
      value.endedAtMs - value.startedAtMs > HAND_RECORD_MAX_DURATION_MS ||
      !integer(value.seed) || !text(value.rulesVersion, 64) || typeof value.dictionaryId !== "string" || !isDictionaryId(value.dictionaryId) ||
      typeof value.dictionaryFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.dictionaryFingerprint)) return false;

  if (!object(value.config) || !integer(value.config.smallBlind) || value.config.smallBlind === 0 ||
      !integer(value.config.bigBlind) || value.config.bigBlind < value.config.smallBlind ||
      !integer(value.config.turnDurationMs, HAND_RECORD_MAX_DURATION_MS) || value.config.turnDurationMs === 0 ||
      typeof value.config.autoSubmitDrafts !== "boolean" || !isPowerUpDealMode(value.config.powerUpDeal)) return false;
  if (value.config.tableName !== undefined && !text(value.config.tableName, 64)) return false;
  if (!Array.isArray(value.seats) || value.seats.length < MIN_SEATS || value.seats.length > MAX_SEATS ||
      !integer(value.dealerSeat, value.seats.length - 1)) return false;
  const seatIds = new Set<string>();
  for (const seat of value.seats) {
    if (!object(seat) || !text(seat.playerId) || seatIds.has(seat.playerId) ||
        (seat.userId !== null && !text(seat.userId)) || !text(seat.name, 64) || !integer(seat.initialStack)) return false;
    seatIds.add(seat.playerId);
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > HAND_RECORD_MAX_ACTIONS) return false;
  let previousMs = value.startedAtMs;
  for (const [sequence, entry] of value.actions.entries()) {
    if (!object(entry) || entry.sequence !== sequence || !timestamp(entry.atMs) ||
        entry.atMs < previousMs || entry.atMs > value.endedAtMs ||
        typeof entry.source !== "string" || !["player", "bot", "timeout", "disconnect"].includes(entry.source) || !action(entry.action) ||
        ("playerId" in entry.action && !seatIds.has(entry.action.playerId))) return false;
    previousMs = entry.atMs;
  }
  const summary = value.summary;
  if (!object(summary) || (summary.outcome !== "fold-out" && summary.outcome !== "showdown") ||
      !Array.isArray(summary.community) || summary.community.length !== 5 || !summary.community.every(tile) ||
      !Array.isArray(summary.seats) || summary.seats.length !== seatIds.size) return false;
  const seen = new Set<string>();
  for (const seat of summary.seats) {
    if (!object(seat) || typeof seat.playerId !== "string" || !seatIds.has(seat.playerId) || seen.has(seat.playerId) ||
        !Array.isArray(seat.privateTiles) || seat.privateTiles.length > 2 || !seat.privateTiles.every(tile) ||
        (seat.submission !== null && !submission(seat.submission)) ||
        (seat.word !== null && (typeof seat.word !== "string" || !/^[A-Z]{1,32}$/.test(seat.word))) ||
        !integer(seat.score) || !integer(seat.finalStack) ||
        (seat.reason !== null && !WORD_REJECTION_REASONS.some((reason) => reason === seat.reason)) ||
        (seat.place !== null && (!integer(seat.place, seatIds.size) || seat.place === 0))) return false;
    seen.add(seat.playerId);
  }
  if (!Array.isArray(summary.pots) || summary.pots.length === 0 || summary.pots.length > seatIds.size ||
      !summary.pots.every((pot: unknown) => {
        if (!object(pot) || !integer(pot.amount) || !ids(pot.eligible, seatIds) || !ids(pot.winners, seatIds)) return false;
        const eligible = pot.eligible;
        return pot.winners.every((id) => eligible.includes(id));
      })) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= HAND_RECORD_MAX_BYTES;
  } catch {
    return false;
  }
}

/** Check the raw UTF-8 size before parsing network input. */
export function parseHandRecord(json: string): HandRecord | null {
  if (new TextEncoder().encode(json).byteLength > HAND_RECORD_MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(json);
    return isHandRecord(value) ? value : null;
  } catch {
    return null;
  }
}
