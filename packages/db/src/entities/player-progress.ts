/**
 * player-progress.ts — one player's account XP, as the database stores it (STO-543).
 *
 * The coins a level pays are never here: a reached level pays through `wallet_event`
 * (`kind: "level"`), and the row that makes that once-only is that table's own reward-once
 * index. `levelPaid` is a high-water mark over those rows, not a second ledger — it only keeps
 * the everyday GET from re-asking the index about levels it already answered; a crash that
 * stalls it below the player's level just re-drives the same no-op payments until it catches up.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

export const PlayerProgress = defineEntity({
  name: "PlayerProgress",
  tableName: "player_progress",
  properties: () => ({
    /** Better Auth's user id — the table is one row per player. */
    userId: p.text().primary(),
    /** The player's total XP; only ever moved by `recordQuestHand`, once per settled hand. */
    xp: p.integer().default(0),
    /** The highest level whose `level` wallet event has been opened; 1 is the starting level. */
    levelPaid: p.integer().default(1),
  }),
});

/** The stored row, as `em.find` hands it back. */
export type PlayerProgressRow = InferEntity<typeof PlayerProgress>;
