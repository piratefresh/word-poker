import { isFriendsPage, isFriendRequestResult, isPresenceResponse, type FriendsPage, type TableInvite } from "@wordpoker/contracts";
import { Platform } from "react-native";
import { authClient } from "@/auth/client/auth-client";
import { apiBaseURL } from "./api-base-url";

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

/** One heartbeat (STO-584): marks this account online and returns the table invites waiting for it. */
export async function beat(atTable: boolean): Promise<TableInvite[]> {
  const result = await call("/presence", "POST", { atTable });
  if (!isPresenceResponse(result)) throw new Error("The presence reply couldn't be read.");
  return result.invites;
}

export async function goOffline(): Promise<void> {
  await call("/presence", "DELETE");
}

export async function inviteFriend(userId: string, roomId: string): Promise<void> {
  await call(`/${encodeURIComponent(userId)}`, "POST", { roomId });
}
