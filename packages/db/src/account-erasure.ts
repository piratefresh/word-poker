/**
 * account-erasure.ts — what deleting an account removes (STO-821).
 *
 * Nothing here holds a foreign key to `user`, so each table is named. The player's own rows go.
 * Online hands stay for the others at the table, with this seat anonymous; `player_id` there is a
 * room session id, so it names nobody. `wallet_event` stays as the audit log: once `user` and the
 * RevenueCat customer are gone its id leads nowhere. Only pending rows change, so none is re-sent.
 */

import type { Sql } from "./platform-auth";

const ERASURE = [
  // An offline session is the player's alone; its hands, seats and actions cascade.
  `delete from game_session where owner_id = $1`,
  `update hand_seat set user_id = null, adopted_from = null, name = 'Anonymous' where user_id = $1`,
  `delete from friends where user_a = $1 or user_b = $1`,
  `delete from friend_code where user_id = $1`,
  `delete from referral where referee_id = $1 or referrer_id = $1`,
  `delete from presence where user_id = $1`,
  `delete from table_invite where to_user = $1 or from_user = $1`,
  `delete from push_token where user_id = $1`,
  `delete from quest_progress where user_id = $1`,
  `delete from quest_hand_log where user_id = $1`,
  `delete from player_progress where user_id = $1`,
  `delete from guest_adoption where user_id = $1`,
  `delete from platform_auth_attempt where user_id = $1`,
  `update wallet_event set status = 'failed', last_error = 'account_deleted', updated_at = now()
   where user_id = $1 and status = 'pending'`,
];

/** Run it inside the caller's transaction (`inTransaction`). Safe to repeat after a failed delete. */
export async function eraseAccountData(sql: Sql, userId: string): Promise<void> {
  for (const statement of ERASURE) await sql.query(statement, [userId]);
}
