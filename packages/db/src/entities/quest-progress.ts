/**
 * quest-progress.ts — one player's progress on one quest, as the database stores it (STO-525).
 *
 * The reward itself is never here: a completed quest pays through `wallet_event` (`kind:
 * "quest"`), and the row that makes the payment once-only is that table's own unique index, not
 * this one. `completedAt` is read-only bookkeeping for the quests screen — "done" is `wallet_event`
 * holding the row, this is just when it happened.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

export const QuestProgress = defineEntity({
  name: "QuestProgress",
  tableName: "quest_progress",
  properties: () => ({
    /** Better Auth's user id. Part of the composite primary key, alongside `questId`. */
    userId: p.text().primary(),
    /** One of `packages/game-rules`' `QuestId`s. */
    questId: p.text().primary(),
    progress: p.integer().default(0),
    /** The best win-streak reached so far; meaningless once the quest is done. */
    streak: p.integer().default(0),
    /** When `progress` first reached the quest's goal, or null while it has not. */
    completedAt: p.datetime().nullable(),
  }),
});

/** The stored row, as `em.find` hands it back. */
export type QuestProgressRow = InferEntity<typeof QuestProgress>;
