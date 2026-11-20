import { isFriendsPage, isFriendRequestResult, isPresenceResponse, type FriendsPage, type PresenceResponse } from "@wordpoker/contracts";
import { Platform } from "react-native";
import { authClient } from "@/auth/client/auth-client";
import { apiBaseURL } from "@/lib/network/api-base-url";

async function call(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const cookie = Platform.OS === "web" ? null : await authClient.getCookie();
  const response = await fetch(`${apiBaseURL}/api/friends${path}`, {
    method,
    credentials: Platform.OS === "web" ? "include" : "omit",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : "Friends couldn't be reached. Try again.");
  }
  return data;
}

export async function getFriends(): Promise<FriendsPage> {
  const page = await call("");
  if (!isFriendsPage(page)) throw new Error("The friends list couldn't be read.");
  return page;
}

export async function addFriend(code: string): Promise<string> {
  const result = await call("", "POST", { code });
  if (!result || typeof result !== "object" || !("result" in result) || !isFriendRequestResult(result.result) ||
    !("message" in result) || typeof result.message !== "string") throw new Error("The friend request result couldn't be read.");
  return result.message;
}

export async function acceptFriend(userId: string): Promise<void> {
  await call(`/${encodeURIComponent(userId)}`, "PUT");
}

export async function removeFriend(userId: string): Promise<void> {
  await call(`/${encodeURIComponent(userId)}`, "DELETE");
}

/**
 * One heartbeat (STO-584): marks this account online at `roomId`'s table (null in the street), so
 * friends can Join it. Returns its waiting table invites and email-verified flag.
 */
export async function beat(roomId: string | null): Promise<PresenceResponse> {
  const result = await call("/presence", "POST", roomId === null ? { atTable: false } : { atTable: true, roomId });
  if (!isPresenceResponse(result)) throw new Error("The presence reply couldn't be read.");
  return result;
}

export async function goOffline(): Promise<void> {
  await call("/presence", "DELETE");
}

export async function inviteFriend(userId: string, roomId: string): Promise<void> {
  await call(`/${encodeURIComponent(userId)}`, "POST", { roomId });
}

/** Nudges a friend to come and play; the server allows one per friend every few hours. */
export async function nudgeFriend(userId: string): Promise<string> {
  const result = await call(`/${encodeURIComponent(userId)}/nudge`, "POST");
  return result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Nudge sent";
}

export async function registerPushToken(token: string): Promise<void> {
  await call("/push-token", "POST", { token });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await call("/push-token", "DELETE", { token });
}
