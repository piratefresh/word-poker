import { randomInt } from "node:crypto";
import type { MikroORM } from "@mikro-orm/postgresql";
import { LAST_SEEN_DAYS, type FriendRequestResult, type FriendsPage, type FriendStatus } from "@wordpoker/contracts";
import { getOrm } from "./orm";

/** A player is online for this long after their last heartbeat (the client beats every 20s). */
export const PRESENCE_GRACE_MS = 45_000;

type DbOptions = { orm?: MikroORM };
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

async function connection(options: DbOptions) {
  return (options.orm ?? await getOrm()).em.getConnection();
}

export async function friendCode(userId: string, options: DbOptions = {}): Promise<string> {
  const db = await connection(options);
  const [existing] = await db.execute<{ code: string }[]>(`select code from friend_code where user_id = ?`, [userId]);
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const [created] = await db.execute<{ code: string }[]>(
      `insert into friend_code (user_id, code) values (?, ?) on conflict do nothing returning code`, [userId, code],
    );
    if (created) return created.code;
    const [raced] = await db.execute<{ code: string }[]>(`select code from friend_code where user_id = ?`, [userId]);
    if (raced) return raced.code;
  }
  throw new Error("Couldn't create a friend code.");
}

export async function userForFriendCode(code: string, options: DbOptions = {}): Promise<string | null> {
  const db = await connection(options);
  const [row] = await db.execute<{ user_id: string }[]>(
    `select c.user_id from friend_code c join "user" u on u.id = c.user_id
     where c.code = ? and coalesce(u."isAnonymous", false) = false`, [code],
  );
  return row?.user_id ?? null;
}

export async function requestFriend(from: string, to: string, options: DbOptions = {}): Promise<FriendRequestResult> {
  if (from === to) return "self";
  const db = await connection(options);
  const users = await db.execute<{ id: string; anonymous: boolean }[]>(
    `select id, coalesce("isAnonymous", false) as anonymous from "user" where id in (?, ?)`, [from, to],
  );
  if (users.length !== 2) return "not-found";
  if (users.some((user) => user.anonymous)) return "guest";
  const [changed] = await db.execute<{ status: string }[]>(
    `insert into friends (user_a, user_b, status, requested_by)
     values (least(?::text, ?::text), greatest(?::text, ?::text), 'pending', ?)
     on conflict (user_a, user_b) do update set status = 'accepted'
       where friends.status = 'pending' and friends.requested_by <> excluded.requested_by
     returning status`, [from, to, from, to, from],
  );
  if (changed) return changed.status === "pending" ? "requested" : "accepted";
  const [existing] = await db.execute<{ status: string }[]>(
    `select status from friends where user_a = least(?::text, ?::text) and user_b = greatest(?::text, ?::text)`, [from, to, from, to],
  );
  return existing?.status === "accepted" ? "already-friends" : "already-requested";
}

export async function acceptFriend(me: string, other: string, options: DbOptions = {}): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ user_a: string }[]>(
    `update friends set status = 'accepted' where user_a = least(?::text, ?::text)
     and user_b = greatest(?::text, ?::text) and status = 'pending' and requested_by = ? and requested_by <> ?
     returning user_a`, [me, other, me, other, other, me],
  );
  return rows.length > 0;
}

export async function removeFriend(me: string, other: string, options: DbOptions = {}): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ user_a: string }[]>(
    `delete from friends where user_a = least(?::text, ?::text) and user_b = greatest(?::text, ?::text) returning user_a`,
    [me, other, me, other],
  );
  return rows.length > 0;
}

export async function friendList(me: string, options: DbOptions = {}): Promise<Omit<FriendsPage, "code" | "referrals">> {
  const db = await connection(options);
  type Row = { userId: string; name: string; image: string | null; status: string; requested_by: string;
    presence: FriendStatus; roomId: string | null; lastSeen: Date | string | null };
  const rows = await db.execute<Row[]>(
    `select u.id as "userId", u.name, u.image, f.status, f.requested_by,
       case when p.seen_at > now() - make_interval(secs => ?::double precision)
         then case when p.at_table then 'at-table' else 'online' end else 'offline' end as presence,
       p.room_id as "roomId",
       case when p.last_seen_at > now() - make_interval(days => ?::int) then p.last_seen_at end as "lastSeen"
     from friends f
     join "user" u on u.id = case when f.user_a = ? then f.user_b else f.user_a end
     left join presence p on p.user_id = u.id
     where (f.user_a = ? or f.user_b = ?) and coalesce(u."isAnonymous", false) = false
     order by u.name, u.id`, [PRESENCE_GRACE_MS / 1000, LAST_SEEN_DAYS, me, me, me],
  );
  const result: Omit<FriendsPage, "code" | "referrals"> = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const person = { userId: row.userId, name: row.name, ...(row.image ? { image: row.image } : {}) };
    if (row.status !== "accepted") {
      (row.requested_by === me ? result.outgoing : result.incoming).push(person);
      continue;
    }
    // Where a friend is is for friends only: a request row says nothing about it.
    result.friends.push({
      ...person,
      status: row.presence,
      ...(row.presence === "at-table" && row.roomId ? { roomId: row.roomId } : {}),
      ...(row.presence === "offline" && row.lastSeen ? { lastSeen: new Date(row.lastSeen).toISOString() } : {}),
    });
  }
  return result;
}

export async function areFriends(a: string, b: string, options: DbOptions = {}): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ user_a: string }[]>(
    `select f.user_a from friends f join "user" a on a.id = f.user_a join "user" b on b.id = f.user_b
     where f.user_a = least(?::text, ?::text) and f.user_b = greatest(?::text, ?::text) and f.status = 'accepted'
     and coalesce(a."isAnonymous", false) = false and coalesce(b."isAnonymous", false) = false`, [a, b, a, b],
  );
  return rows.length > 0;
}

/** Attributes a new account to the owner of `code`, once; a guest, unknown code or self changes nothing. */
export async function recordReferral(refereeId: string, code: string, options: DbOptions = {}): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ referee_id: string }[]>(
    `insert into referral (referee_id, referrer_id)
     select ?, c.user_id from friend_code c join "user" u on u.id = c.user_id
     where c.code = ? and coalesce(u."isAnonymous", false) = false and c.user_id <> ?
     on conflict do nothing returning referee_id`, [refereeId, code, refereeId],
  );
  return rows.length > 0;
}

export async function referrerOf(refereeId: string, options: DbOptions = {}): Promise<string | null> {
  const db = await connection(options);
  const [row] = await db.execute<{ referrer_id: string }[]>(`select referrer_id from referral where referee_id = ?`, [refereeId]);
  return row?.referrer_id ?? null;
}

/** Referrals this player has been paid for (the referee's own grant, ref `referee`, is not one). */
export async function paidReferralCount(userId: string, options: DbOptions = {}): Promise<number> {
  const db = await connection(options);
  const [row] = await db.execute<{ n: string }[]>(
    `select count(*) as n from wallet_event where user_id = ? and kind = 'referral' and ref <> 'referee'`, [userId],
  );
  return Number(row?.n ?? 0);
}

/** Accounts that signed up through this player's link. */
export async function referralCount(userId: string, options: DbOptions = {}): Promise<number> {
  const db = await connection(options);
  const [row] = await db.execute<{ n: string }[]>(`select count(*) as n from referral where referrer_id = ?`, [userId]);
  return Number(row?.n ?? 0);
}

export async function displayName(userId: string, options: DbOptions = {}): Promise<string> {
  const db = await connection(options);
  const [row] = await db.execute<{ name: string }[]>(`select name from "user" where id = ?`, [userId]);
  return row?.name ?? "A player";
}
