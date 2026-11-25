/**
 * vip.ts — VIP Points storage (STO-1170).
 *
 * Like `recordQuestHand`, this package never imports `@wordpoker/game-rules`: the caller passes an
 * `apply` that turns the stored standing into what to add. `recordVipPoints` runs it once per
 * `token` — the `vip_point_log` primary key makes a repeat a no-op — and rolls the daily play
 * counter over when the UTC day has changed.
 */

import type { MikroORM, Transaction } from "@mikro-orm/postgresql";

import { getOrm } from "./orm";

type DbOptions = { orm?: MikroORM };

/** A player's stored VIP standing; a player with no row reads all zeros. */
export interface VipProgressRecord {
  readonly points: number;
  readonly tierPaid: number;
  /** Play points on `day`; 0 when the stored day is another one. */
  readonly playToday: number;
}

/** What `apply` sees and returns. `playToday` is already rolled to the current day. */
export interface VipEarnInput {
  readonly points: number;
  readonly playToday: number;
}

export interface VipEarnResult {
  readonly added: number;
  readonly playToday: number;
}

interface VipSqlRow {
  points: string | number;
  tier_paid: number;
  play_day: string | Date | null;
  play_today: number;
}

async function connection(options: DbOptions) {
  const instance = options.orm ?? (await getOrm());
  return instance.em.getConnection();
}

function dayOf(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function toRecord(row: VipSqlRow | undefined, day: string): VipProgressRecord {
  if (!row) return { points: 0, tierPaid: 0, playToday: 0 };
  return {
    points: Number(row.points),
    tierPaid: row.tier_paid,
    playToday: dayOf(row.play_day) === day ? row.play_today : 0,
  };
}

/** A player's VIP standing on UTC `day` (`YYYY-MM-DD`). */
export async function vipProgress(userId: string, day: string, options: DbOptions = {}): Promise<VipProgressRecord> {
  const db = await connection(options);
  const [row] = await db.execute<VipSqlRow[]>(
    `select "points", "tier_paid", "play_day"::text as "play_day", "play_today" from "vip_progress" where "user_id" = ?`,
    [userId],
  );
  return toRecord(row, day);
}

/**
 * Adds points once per `token`, inside one transaction. A repeated token never calls `apply` and
 * resolves with `duplicate: true` and the current standing.
 */
export async function recordVipPoints(
  userId: string,
  token: string,
  day: string,
  apply: (current: VipEarnInput) => VipEarnResult,
  options: DbOptions = {},
): Promise<VipProgressRecord & { duplicate: boolean; added: number }> {
  const db = await connection(options);

  return db.transactional(async (trx: Transaction) => {
    await db.execute(
      `insert into "vip_progress" ("user_id") values (?) on conflict do nothing`,
      [userId],
      "run",
      trx,
    );
    const [row] = await db.execute<VipSqlRow[]>(
      `select "points", "tier_paid", "play_day"::text as "play_day", "play_today" from "vip_progress" where "user_id" = ? for update`,
      [userId],
      "all",
      trx,
    );
    const current = toRecord(row, day);

    const [logged] = await db.execute<{ token: string }[]>(
      `insert into "vip_point_log" ("user_id", "token", "points") values (?, ?, 0) on conflict do nothing returning "token"`,
      [userId, token],
      "all",
      trx,
    );
    if (!logged) return { ...current, duplicate: true, added: 0 };

    const result = apply({ points: current.points, playToday: current.playToday });
    const added = Math.max(0, Math.round(result.added));
    await db.execute(
      `update "vip_point_log" set "points" = ? where "user_id" = ? and "token" = ?`,
      [added, userId, token],
      "run",
      trx,
    );
    await db.execute(
      `update "vip_progress" set "points" = "points" + ?, "play_day" = ?::date, "play_today" = ?, "updated_at" = now() where "user_id" = ?`,
      [added, day, result.playToday, userId],
      "run",
      trx,
    );

    return { points: current.points + added, tierPaid: current.tierPaid, playToday: result.playToday, duplicate: false, added };
  });
}

/** Advances the tier-reward high-water mark; never moves it backwards. */
export async function setVipTierPaid(userId: string, tier: number, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(
    `insert into "vip_progress" ("user_id", "tier_paid") values (?, ?)
     on conflict ("user_id") do update set "tier_paid" = greatest("vip_progress"."tier_paid", excluded."tier_paid"), "updated_at" = now()`,
    [userId, tier],
    "run",
  );
}
