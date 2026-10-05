/**
 * quest-hand-log.ts — one settled hand a player has already reported, as the database stores it
 * (STO-525).
 *
 * The point of this table is the unique index on `(user_id, hand_token)` (in the migration): a
 * client-minted token that collides opens no row, which is what makes `recordQuestHand` safe
 * against a retried POST reporting the same hand twice.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

export const QuestHandLog = defineEntity({
  name: "QuestHandLog",
  tableName: "quest_hand_log",
  properties: () => ({
    id: p.uuid().primary().defaultRaw("gen_random_uuid()").onCreate(() => randomUUID()),
    createdAt: p.datetime().onCreate(() => new Date()),
    userId: p.text(),
    /** Minted by the client once per reported hand (not a secret) — the dedupe key. */
    handToken: p.text(),
  }),
});

/** The stored row, as `em.find` hands it back. */
export type QuestHandLogRow = InferEntity<typeof QuestHandLog>;
