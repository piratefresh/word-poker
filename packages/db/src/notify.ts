import type { MikroORM } from "@mikro-orm/postgresql";
import { getOrm } from "./orm";

type DbOptions = { orm?: MikroORM; fetch?: typeof fetch };

/** Each kind and the "user" column that switches it; fixed here, never built from input. */
const KIND_COLUMN = {
  tableInvite: "notifyTableInvite",
  friendRequest: "notifyFriendRequest",
  friendOnline: "notifyFriendOnline",
} as const;

export type NotificationKind = keyof typeof KIND_COLUMN;

export interface Notification { readonly title: string; readonly body: string; readonly url?: string }

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100;

async function connection(options: DbOptions) {
  return (options.orm ?? await getOrm()).em.getConnection();
}

const placeholders = (values: readonly unknown[]) => values.map(() => "?").join(", ");

/** Registers a device token for an account; a token that moves to another account moves for good. */
export async function savePushToken(userId: string, token: string, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(
    `insert into push_token (token, user_id) values (?, ?)
     on conflict (token) do update set user_id = excluded.user_id, updated_at = now()`, [token, userId],
  );
}

/** Forgets a device token, but only if the account still owns it. */
export async function deletePushToken(userId: string, token: string, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(`delete from push_token where token = ? and user_id = ?`, [token, userId]);
}

function unregistered(ticket: unknown): boolean {
  return typeof ticket === "object" && ticket !== null && "details" in ticket &&
    typeof ticket.details === "object" && ticket.details !== null && "error" in ticket.details &&
    ticket.details.error === "DeviceNotRegistered";
}

/**
 * Pushes to every device of the users who have this kind switched on. Never throws: a push is a
 * nicety, and the caller has already done the thing it is telling someone about.
 * ponytail: no receipt polling; add when delivery stats matter
 */
export async function notifyUsers(
  userIds: readonly string[],
  kind: NotificationKind,
  message: Notification,
  options: DbOptions = {},
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const db = await connection(options);
    const send = options.fetch ?? fetch;
    const rows = await db.execute<{ token: string }[]>(
      `select t.token from push_token t join "user" u on u.id = t.user_id
       where t.user_id in (${placeholders(userIds)}) and u."${KIND_COLUMN[kind]}" = true`,
      [...userIds],
    );
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const response = await send(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(chunk.map(({ token }) => ({
          to: token, title: message.title, body: message.body, sound: "default",
          ...(message.url ? { data: { url: message.url } } : {}),
        }))),
      });
      const result: unknown = await response.json().catch(() => null);
      const tickets: unknown[] = typeof result === "object" && result !== null && "data" in result && Array.isArray(result.data) ? result.data : [];
      const dead = chunk.filter((_, index) => unregistered(tickets[index]));
      if (dead.length > 0) {
        await db.execute(`delete from push_token where token in (${placeholders(dead)})`, dead.map(({ token }) => token));
      }
    }
  } catch (error) {
    console.error("[notify] push failed:", error);
  }
}
