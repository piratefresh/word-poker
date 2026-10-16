export const FRIEND_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

export interface Friend {
  readonly userId: string;
  readonly name: string;
  /** Accepted friends only; absent on request rows. */
  readonly status?: FriendStatus;
}

export interface FriendsPage {
  readonly code: string;
  readonly friends: Friend[];
  readonly incoming: Friend[];
  readonly outgoing: Friend[];
  /** Players who signed up through this player's invite link. */
  readonly referrals: number;
}

export type FriendRequestResult = "requested" | "accepted" | "already-friends" | "already-requested" | "self" | "not-found" | "guest";

export const FRIEND_REQUEST_MESSAGES = {
  requested: "Friend request sent",
  accepted: "You're now friends",
  "already-friends": "You're already friends",
  "already-requested": "Request already sent",
  self: "That's your own code.",
  "not-found": "That player couldn't be found.",
  guest: "Guests can't be added as friends",
} as const satisfies Record<FriendRequestResult, string>;

export function isFriendCode(value: unknown): value is string {
  return typeof value === "string" && value.length === 8 && FRIEND_CODE_PATTERN.test(value);
}

export function isFriendRequestResult(value: unknown): value is FriendRequestResult {
  return typeof value === "string" && Object.hasOwn(FRIEND_REQUEST_MESSAGES, value);
}

function isFriend(value: unknown): value is Friend {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (row.status === undefined || isFriendStatus(row.status)) &&
    typeof row.userId === "string" && row.userId.length > 0 && row.userId.length <= 256 &&
    typeof row.name === "string" && row.name.length <= 512;
}

export function isFriendsPage(value: unknown): value is FriendsPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return isFriendCode(page.code) && Number.isInteger(page.referrals) && (page.referrals as number) >= 0 && [page.friends, page.incoming, page.outgoing].every(
    (rows) => Array.isArray(rows) && rows.length <= 10000 && rows.every(isFriend),
  );
}

export interface BefriendAction { readonly playerId: string }
export interface BefriendResult extends BefriendAction { readonly message: string }

export function isBefriendAction(value: unknown): value is BefriendAction {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.playerId === "string" && row.playerId.length > 0 && row.playerId.length <= 256;
}

export function isBefriendResult(value: unknown): value is BefriendResult {
  return isBefriendAction(value) && "message" in value && typeof value.message === "string" && value.message.length <= 512;
}

/** A friend's presence (STO-584): `at-table` while their app holds a room, `offline` once the heartbeat lapses. */
export const FRIEND_STATUSES = ["online", "at-table", "offline"] as const;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];

/** A friend's invitation to their table, delivered on the invitee's next heartbeat. */
export interface TableInvite { readonly fromName: string; readonly roomId: string }

/** `POST /api/friends/presence`: the invites waiting for this player, and whether their email is verified (STO-627). */
export interface PresenceResponse { readonly invites: TableInvite[]; readonly emailVerified: boolean }

export const TABLE_STARTED_MESSAGE = "That table has already started.";

/** What a room id may look like on the wire: a Colyseus id, nothing a URL could bend. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isFriendStatus(value: unknown): value is FriendStatus {
  return (FRIEND_STATUSES as readonly unknown[]).includes(value);
}

export function isTableInvite(value: unknown): value is TableInvite {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.fromName === "string" && row.fromName.length <= 512 &&
    typeof row.roomId === "string" && ROOM_ID_PATTERN.test(row.roomId);
}

export function isPresenceResponse(value: unknown): value is PresenceResponse {
  if (typeof value !== "object" || value === null) return false;
  const { invites, emailVerified } = value as Record<string, unknown>;
  return Array.isArray(invites) && invites.length <= 100 && invites.every(isTableInvite) && typeof emailVerified === "boolean";
}
