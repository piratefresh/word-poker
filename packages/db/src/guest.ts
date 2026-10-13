/**
 * guest.ts — what a guest's play becomes when they register.
 *
 * Better Auth deletes the anonymous user on link, so the rows that name it move to the new account
 * first (`adoptGuestHistory`), and the welcome bonus counts what moved (`countPlayedHands`).
 */

import type { MikroORM } from "@mikro-orm/postgresql";

import { getOrm } from "./orm";

interface DbOptions {
  readonly orm?: MikroORM;
}

/** Re-keys a guest's hand seats and offline sessions to the account that replaces them. */
export async function adoptGuestHistory(
  guestId: string,
  userId: string,
  options: DbOptions = {},
): Promise<void> {
  const db = (options.orm ?? (await getOrm())).em.getConnection();

  await db.execute(`update "hand_seat" set "user_id" = ? where "user_id" = ?`, [userId, guestId]);
  await db.execute(`update "game_session" set "owner_id" = ? where "owner_id" = ?`, [userId, guestId]);
}

/** How many hands this account has sat in. */
export async function countPlayedHands(userId: string, options: DbOptions = {}): Promise<number> {
  const db = (options.orm ?? (await getOrm())).em.getConnection();
  const [row] = await db.execute<{ n: string }[]>(
    `select count(*) as n from "hand_seat" where "user_id" = ?`,
    [userId],
  );

  return Number(row?.n ?? 0);
}
