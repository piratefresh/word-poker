/**
 * guest.ts — what a guest's play becomes when they register.
 *
 * The rows that name a guest move to the account that replaces it (`adoptGuestHistory`) before the
 * guest is deleted, and the welcome bonus counts what moved (`countPlayedHands`).
 */

import type { MikroORM } from "@mikro-orm/postgresql";

import { getOrm } from "./orm";
import type { Sql } from "./platform-auth";

interface DbOptions {
  readonly orm?: MikroORM;
}

/**
 * Claims the guest for one account and re-keys its hand seats and offline sessions there. Run it
 * inside the caller's transaction (`inTransaction`): the claim and the move commit together, and a
 * second account racing for the same guest waits on the claim, then loses. Resolves false for that
 * loser; true when the history is (or already was) this account's.
 */
export async function adoptGuestHistory(sql: Sql, guestId: string, userId: string): Promise<boolean> {
  const claim = await sql.query(
    `insert into guest_adoption (guest_id, user_id) values ($1, $2) on conflict (guest_id) do nothing`,
    [guestId, userId],
  );
  if (claim.rowCount === 0) {
    const { rows } = await sql.query<{ user_id: string }>(`select user_id from guest_adoption where guest_id = $1`, [guestId]);
    return rows[0]?.user_id === userId;
  }

  // `adopted_from` marks the seats that were a guest's, which is what the welcome bonus counts.
  await sql.query(
    `with seats as (
       update "hand_seat" set "user_id" = $1, "adopted_from" = $2 where "user_id" = $2
     )
     update "game_session" set "owner_id" = $1 where "owner_id" = $2`,
    [userId, guestId],
  );
  return true;
}

/** How many hands this account played as a guest before registering. */
export async function countPlayedHands(userId: string, options: DbOptions = {}): Promise<number> {
  const db = (options.orm ?? (await getOrm())).em.getConnection();
  const [row] = await db.execute<{ n: string }[]>(
    `select count(*) as n from "hand_seat" where "user_id" = ? and "adopted_from" is not null`,
    [userId],
  );

  return Number(row?.n ?? 0);
}
