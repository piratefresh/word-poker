import type { MikroORM } from "@mikro-orm/postgresql";
import type { TableInvite } from "@wordpoker/contracts";
import { areFriends } from "./friends";
import { getOrm } from "./orm";

type DbOptions = { orm?: MikroORM };

/** A player is online for this long after their last heartbeat (the client beats every 20s). */
export const PRESENCE_GRACE_MS = 45_000;
/** An invite that was not picked up by then is stale: the table has moved on. */
const INVITE_TTL_MINUTES = 10;
/** "Friend came online" is announced at most this often per player. */
const ANNOUNCE_HOURS = 3;

async function connection(options: DbOptions) {
  return (options.orm ?? await getOrm()).em.getConnection();
}

/**
 * Records a heartbeat. `cameOnline`: the player was absent or stale until now. `announce`: that, and
 * they have not been announced to their friends for a few hours; the same statement stamps it, so two
 * instances never both announce.
 */
export async function beat(userId: string, atTable: boolean, options: DbOptions = {}): Promise<{ cameOnline: boolean; announce: boolean }> {
  const db = await connection(options);
  const [row] = await db.execute<{ cameOnline: boolean; announce: boolean }[]>(
    `with prev as (select seen_at, announced_at from presence where user_id = ?),
     f as (select
       coalesce((select seen_at < now() - make_interval(secs => ?::double precision) from prev), true) as came,
       coalesce((select seen_at < now() - make_interval(secs => ?::double precision)
         and (announced_at is null or announced_at < now() - make_interval(hours => ?::int)) from prev), true) as announce)
     insert into presence as p (user_id, seen_at, at_table, announced_at)
     select ?, now(), ?::boolean, case when f.announce then now() end from f
     on conflict (user_id) do update set seen_at = now(), at_table = excluded.at_table,
       announced_at = case when (select announce from f) then now() else p.announced_at end
     returning (select came from f) as "cameOnline", (select announce from f) as announce`,
    [userId, PRESENCE_GRACE_MS / 1000, PRESENCE_GRACE_MS / 1000, ANNOUNCE_HOURS, userId, atTable],
  );
  return { cameOnline: row?.cameOnline ?? true, announce: row?.announce ?? false };
}

/** The app closed or went to the background: stale at once, keeping the announce stamp. */
export async function goOffline(userId: string, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(`update presence set seen_at = 'epoch', at_table = false where user_id = ?`, [userId]);
}

/** Whether the player's app has beaten recently. */
export async function isOnline(userId: string, options: DbOptions = {}): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ user_id: string }[]>(
    `select user_id from presence where user_id = ? and seen_at > now() - make_interval(secs => ?::double precision)`,
    [userId, PRESENCE_GRACE_MS / 1000],
  );
  return rows.length > 0;
}

/** Leaves one invite for a friend (a newer one from the same sender replaces it); false for a non-friend. */
export async function inviteToTable(from: string, to: string, roomId: string, options: DbOptions = {}): Promise<boolean> {
  if (!await areFriends(from, to, options)) return false;
  const db = await connection(options);
  await db.execute(
    `insert into table_invite (to_user, from_user, room_id) values (?, ?, ?)
     on conflict (to_user, from_user) do update set room_id = excluded.room_id, created_at = now()`,
    [to, from, roomId],
  );
  return true;
}

/** Hands over the player's waiting invites, once; stale ones are dropped unseen. */
export async function takeInvites(userId: string, options: DbOptions = {}): Promise<TableInvite[]> {
  const db = await connection(options);
  return db.execute<TableInvite[]>(
    `with taken as (
       delete from table_invite i using "user" u where i.to_user = ? and u.id = i.from_user
       returning u.name as "fromName", i.room_id as "roomId", i.created_at)
     select "fromName", "roomId" from taken
     where created_at > now() - make_interval(mins => ?::int) order by created_at`,
    [userId, INVITE_TTL_MINUTES],
  );
}
