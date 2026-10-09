/**
 * quests.ts — quest progress and the hand-report log (STO-525).
 *
 * `recordQuestHand` is the one write both tables share, in one transaction: the hand log's unique
 * index on `(user_id, hand_token)` makes a retried report a no-op before `apply` ever runs, and
 * the progress upsert that follows only touches the quests the hand actually changed. The map
 * `apply` is handed and the one it returns are plain data — this package never imports
 * `@wordpoker/game-rules`, so the evaluator that judges a hand is always the caller's.
 */

import type { MikroORM, Transaction } from "@mikro-orm/postgresql";
import type { QuestId, WalletEventKind } from "@wordpoker/contracts";
import { QUEST_IDS } from "@wordpoker/contracts";

import { getOrm } from "./orm";

/** One quest's progress, in the shape `applyQuestHand` (`@wordpoker/game-rules`) reads and returns. */
export interface QuestProgressEntry {
  readonly progress: number;
  readonly streak: number;
  readonly done: boolean;
}

export type QuestProgressMap = Record<QuestId, QuestProgressEntry>;

/** One stored row, as `questProgress` hands it back. */
export interface QuestProgressRecord {
  readonly questId: QuestId;
  readonly progress: number;
  readonly streak: number;
  readonly completedAt: Date | null;
}

interface QuestProgressSqlRow {
  quest_id: string;
  progress: number;
  streak: number;
  completed_at: Date | string | null;
}

type DbOptions = { orm?: MikroORM };

function toRecord(row: QuestProgressSqlRow): QuestProgressRecord {
  return {
    questId: row.quest_id as QuestId,
    progress: row.progress,
    streak: row.streak,
    completedAt:
      row.completed_at === null
        ? null
        : row.completed_at instanceof Date
          ? row.completed_at
          : new Date(row.completed_at),
  };
}

async function connection(options: DbOptions) {
  const instance = options.orm ?? (await getOrm());

  return instance.em.getConnection();
}

/** A player's stored quest rows; a quest it has not touched yet has none. */
export async function questProgress(userId: string, options: DbOptions = {}): Promise<QuestProgressRecord[]> {
  const db = await connection(options);
  const rows = await db.execute<QuestProgressSqlRow[]>(
    `select "quest_id", "progress", "streak", "completed_at" from "quest_progress" where "user_id" = ?`,
    [userId],
  );

  return rows.map(toRecord);
}

const EMPTY_ENTRY: QuestProgressEntry = { progress: 0, streak: 0, done: false };

function toMap(rows: readonly QuestProgressRecord[]): QuestProgressMap {
  const byId = new Map(rows.map((row) => [row.questId, row]));
  const map = {} as QuestProgressMap;

  for (const id of QUEST_IDS) {
    const row = byId.get(id);
    map[id] = row ? { progress: row.progress, streak: row.streak, done: row.completedAt !== null } : EMPTY_ENTRY;
  }

  return map;
}

function sameEntry(a: QuestProgressEntry, b: QuestProgressEntry): boolean {
  return a.progress === b.progress && a.streak === b.streak && a.done === b.done;
}

/**
 * Records one settled hand and runs `apply` over the player's progress — once per `handToken`.
 *
 * A token already in `quest_hand_log` means this hand was reported before (a retried POST, the
 * provider's own replay of a failed one): `apply` never runs, nothing changes, and the player's
 * current XP total comes back untouched. On a first report the hand's `xp` is added to the
 * player's total in the same transaction, after the log insert has won — the caller passes the
 * amount because this package never imports `@wordpoker/game-rules` (STO-545), the same deal
 * as `apply`. Resolves with the player's XP total after the hand either way.
 */
export async function recordQuestHand(
  userId: string,
  handToken: string,
  apply: (map: QuestProgressMap) => { next: QuestProgressMap; completed: readonly QuestId[] },
  xp: number,
  options: DbOptions = {},
): Promise<{ completed: readonly QuestId[]; duplicate: boolean; xp: number }> {
  const db = await connection(options);

  return db.transactional(async (trx: Transaction) => {
    const [logged] = await db.execute<{ id: string }[]>(
      `insert into "quest_hand_log" ("user_id", "hand_token") values (?, ?) on conflict do nothing returning "id"`,
      [userId, handToken],
      "all",
      trx,
    );
    if (!logged) {
      const [row] = await db.execute<{ xp: number }[]>(
        `select "xp" from "player_progress" where "user_id" = ?`,
        [userId],
        "all",
        trx,
      );

      return { completed: [], duplicate: true, xp: row?.xp ?? 0 };
    }

    // The floor (both arms) keeps a hostile `xp` from dragging a total negative; claims report
    // whole, capped amounts (contracts' `MAX_HERO_SCORE`), so this never bites a real hand.
    const [total] = await db.execute<{ xp: number }[]>(
      `insert into "player_progress" ("user_id", "xp") values (?, greatest(?::integer, 0))
       on conflict ("user_id") do update set "xp" = greatest("player_progress"."xp" + excluded."xp", 0)
       returning "xp"`,
      [userId, xp],
      "all",
      trx,
    );

    const rows = await db.execute<QuestProgressSqlRow[]>(
      `select "quest_id", "progress", "streak", "completed_at" from "quest_progress" where "user_id" = ? for update`,
      [userId],
      "all",
      trx,
    );
    const before = toMap(rows.map(toRecord));
    const completedAt = new Map(rows.map(toRecord).map((row) => [row.questId, row.completedAt]));
    const { next, completed } = apply(before);

    for (const id of QUEST_IDS) {
      if (sameEntry(before[id], next[id])) continue;

      const entry = next[id];
      await db.execute(
        `insert into "quest_progress" ("user_id", "quest_id", "progress", "streak", "completed_at")
         values (?, ?, ?, ?, ?)
         on conflict ("user_id", "quest_id") do update
           set "progress" = excluded."progress", "streak" = excluded."streak", "completed_at" = excluded."completed_at"`,
        [
          userId,
          id,
          entry.progress,
          entry.streak,
          entry.done ? completedAt.get(id) ?? new Date() : null,
        ],
        "run",
        trx,
      );
    }

    return { completed, duplicate: false, xp: total?.xp ?? 0 };
  });
}

/** One player's XP row: the total, and the level-payout high-water mark. */
export interface PlayerProgressRecord {
  readonly xp: number;
  readonly levelPaid: number;
}

/** A player's XP total and level high-water mark — a player with no row yet reads 0 / level 1. */
export async function playerProgress(userId: string, options: DbOptions = {}): Promise<PlayerProgressRecord> {
  const db = await connection(options);
  const [row] = await db.execute<{ xp: number; level_paid: number }[]>(
    `select "xp", "level_paid" from "player_progress" where "user_id" = ?`,
    [userId],
  );

  return { xp: row?.xp ?? 0, levelPaid: row?.level_paid ?? 1 };
}

/**
 * Advances a player's level-payout high-water mark, creating the row when there is none. The
 * `wallet_event` reward-once index stays the real once-only rule — this only records how far
 * the payments are known to have run, so it never moves backwards.
 */
export async function setLevelPaid(userId: string, level: number, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(
    `insert into "player_progress" ("user_id", "level_paid") values (?, ?)
     on conflict ("user_id") do update set "level_paid" = greatest("player_progress"."level_paid", excluded."level_paid")`,
    [userId, level],
    "run",
  );
}

/** A player's `streak` wallet-event dates (`ref` = UTC `YYYY-MM-DD`), newest first. */
export async function streakDates(userId: string, options: DbOptions = {}): Promise<string[]> {
  const db = await connection(options);
  const kind: WalletEventKind = "streak";
  const rows = await db.execute<{ ref: string }[]>(
    `select "ref" from "wallet_event" where "user_id" = ? and "kind" = ? order by "created_at" desc`,
    [userId, kind],
  );

  return rows.map((row) => row.ref);
}
