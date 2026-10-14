import { randomInt } from "node:crypto";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { Friend, FriendRequestResult, FriendsPage } from "@wordpoker/contracts";
import { getOrm } from "./orm";

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

export async function friendList(me: string, options: DbOptions = {}): Promise<Omit<FriendsPage, "code">> {
  const db = await connection(options);
  const rows = await db.execute<(Friend & { status: string; requested_by: string })[]>(
    `select u.id as "userId", u.name, f.status, f.requested_by from friends f
     join "user" u on u.id = case when f.user_a = ? then f.user_b else f.user_a end
     where (f.user_a = ? or f.user_b = ?) and coalesce(u."isAnonymous", false) = false
     order by u.name, u.id`, [me, me, me],
  );
  const result: Omit<FriendsPage, "code"> = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const list = row.status === "accepted" ? result.friends : row.requested_by === me ? result.outgoing : result.incoming;
    list.push({ userId: row.userId, name: row.name });
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
