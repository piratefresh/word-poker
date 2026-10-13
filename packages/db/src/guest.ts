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

  // One statement, so the two moves land together or not at all. `adopted_from` marks the seats
  // that were a guest's, which is what the welcome bonus counts.
  await db.execute(
    `with seats as (
       update "hand_seat" set "user_id" = ?, "adopted_from" = ? where "user_id" = ?
     )
     update "game_session" set "owner_id" = ? where "owner_id" = ?`,
    [userId, guestId, guestId, userId, guestId],
  );
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
