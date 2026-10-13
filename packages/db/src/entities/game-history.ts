import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import type {
  HandRecordConfig,
  HandRecordSummary,
  RecordedHandAction,
} from "@wordpoker/contracts";

export const GameSession = defineEntity({
  name: "GameSession",
  tableName: "game_session",
  properties: () => ({
    id: p.uuid().primary(),
    mode: p.text(),
    /** Offline account owner; online membership is recorded per hand seat. */
    ownerId: p.text().nullable(),
    createdAt: p.datetime().defaultRaw("now()"),
  }),
  uniques: [{ properties: ["id", "mode"] }],
  indexes: [{ properties: ["ownerId", "createdAt", "id"] }],
});

export const GameHand = defineEntity({
  name: "GameHand",
  tableName: "game_hand",
  properties: () => ({
    id: p.uuid().primary().defaultRaw("gen_random_uuid()").onCreate(() => randomUUID()),
    session: p.manyToOne(GameSession).deleteRule("cascade"),
    handNo: p.integer(),
    mode: p.text(),
    /** Server-only sequence. Writers must serialize insertion through commit (STO-455/458). */
    insertionCursor: p.bigint("string").autoincrement().unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    startedAt: p.datetime(),
    endedAt: p.datetime(),
    version: p.integer(),
    ranked: p.boolean(),
    seed: p.bigint("number"),
    dealerSeat: p.integer(),
    rulesVersion: p.text(),
    dictionaryId: p.text(),
    dictionaryFingerprint: p.text(),
    payloadDigest: p.text(),
    config: p.json<HandRecordConfig>(),
    summary: p.json<HandRecordSummary>(),
  }),
  uniques: [{ properties: ["session", "handNo"] }],
  indexes: [
    { properties: ["endedAt", "id"] },
    { properties: ["session", "endedAt", "id"] },
  ],
});

export const HandSeat = defineEntity({
  name: "HandSeat",
  tableName: "hand_seat",
  properties: () => ({
    hand: p.manyToOne(GameHand).primary().deleteRule("cascade"),
    seat: p.integer().primary(),
    playerId: p.text(),
    userId: p.text().nullable(),
    name: p.text(),
    initialStack: p.bigint("number"),
  }),
  uniques: [{ properties: ["hand", "playerId"] }, { properties: ["hand", "userId"] }],
  indexes: [{ properties: ["userId", "hand"] }],
});

export const HandAction = defineEntity({
  name: "HandAction",
  tableName: "hand_action",
  properties: () => ({
    hand: p.manyToOne(GameHand).primary().deleteRule("cascade"),
    sequence: p.integer().primary(),
    at: p.datetime(),
    source: p.text(),
    action: p.json<RecordedHandAction>(),
  }),
});

export type GameSessionRow = InferEntity<typeof GameSession>;
export type GameHandRow = InferEntity<typeof GameHand>;
export type HandSeatRow = InferEntity<typeof HandSeat>;
export type HandActionRow = InferEntity<typeof HandAction>;
