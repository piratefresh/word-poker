import { beat, deletePushToken, inviteToTable, isOnline, notifyUsers, savePushToken, takeInvites, friendCode, friendList, referralCount, requestFriend, userForFriendCode, acceptFriend, removeFriend } from "@wordpoker/db";
import { GET, POST } from "@/app/api/friends+api";
import { PUT, DELETE, POST as invitePOST } from "@/app/api/friends/[userId]+api";
import { POST as pushPOST, DELETE as pushDELETE } from "@/app/api/friends/push-token+api";
import { POST as presencePOST } from "@/app/api/friends/presence+api";
import { sessionUser } from "@/auth/server/session-user";

jest.mock("@wordpoker/db", () => ({ friendCode: jest.fn(), friendList: jest.fn(), referralCount: jest.fn(), beat: jest.fn(), isOnline: jest.fn(), notifyUsers: jest.fn(), savePushToken: jest.fn(), deletePushToken: jest.fn(), goOffline: jest.fn(), takeInvites: jest.fn(), inviteToTable: jest.fn(), requestFriend: jest.fn(), userForFriendCode: jest.fn(), acceptFriend: jest.fn(), removeFriend: jest.fn() }));
jest.mock("@/auth/server/session-user", () => ({ sessionUser: jest.fn() }));

function request(method: string, body?: unknown) {
  return new Request("https://api.test/api/friends", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(sessionUser).mockResolvedValue({ id: "caller", name: "Ada", anonymous: false });
  jest.mocked(friendCode).mockResolvedValue("ABCD2345");
  jest.mocked(friendList).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  jest.mocked(userForFriendCode).mockResolvedValue("target");
  jest.mocked(referralCount).mockResolvedValue(3);
});

test.each([null, { id: "caller", name: "Ada", anonymous: true }])("rejects every route for missing or guest sessions: %j", async (user) => {
  jest.mocked(sessionUser).mockResolvedValue(user);
  const status = user ? 403 : 401;
  for (const response of [await GET(request("GET")), await POST(request("POST", { code: "ABCD2345" })),
    await PUT(request("PUT"), { userId: "target" }), await DELETE(request("DELETE"), { userId: "target" })]) {
    expect(response.status).toBe(status);
  }
  expect(friendCode).not.toHaveBeenCalled();
  expect(requestFriend).not.toHaveBeenCalled();
  expect(acceptFriend).not.toHaveBeenCalled();
  expect(removeFriend).not.toHaveBeenCalled();
});

test("reads only the caller's list and disables caching", async () => {
  const response = await GET(request("GET"));
  expect(await response.json()).toEqual({ code: "ABCD2345", friends: [], incoming: [], outgoing: [], referrals: 3 });
  expect(friendList).toHaveBeenCalledWith("caller");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test.each([
  ["requested", 201], ["accepted", 200], ["already-friends", 409], ["already-requested", 409],
  ["self", 400], ["not-found", 404], ["guest", 404],
] as const)("maps %s to HTTP %s", async (result, status) => {
  jest.mocked(requestFriend).mockResolvedValue(result);
  const response = await POST(request("POST", { code: "ABCD2345", userId: "forged" }));
  expect(response.status).toBe(status);
  expect(requestFriend).toHaveBeenCalledWith("caller", "target");
  if (result === "guest") expect(await response.json()).toEqual({ error: "That player couldn't be found." });
});

test("refuses malformed and unknown codes", async () => {
  expect((await POST(request("POST", { code: "invalid" }))).status).toBe(400);
  expect((await POST(new Request("https://api.test/api/friends", { method: "POST", body: "{" }))).status).toBe(400);
  expect(userForFriendCode).not.toHaveBeenCalled();
  jest.mocked(userForFriendCode).mockResolvedValue(null);
  expect((await POST(request("POST", { code: "ABCD2345" }))).status).toBe(404);
  expect(requestFriend).not.toHaveBeenCalled();
});

test("accept/delete always pair the caller with the route parameter", async () => {
  jest.mocked(acceptFriend).mockResolvedValue(true);
  jest.mocked(removeFriend).mockResolvedValue(true);
  expect((await PUT(request("PUT", { caller: "forged" }), { userId: "target" })).status).toBe(200);
  expect((await DELETE(request("DELETE", { caller: "forged" }), { userId: "target" })).status).toBe(200);
  expect(acceptFriend).toHaveBeenCalledWith("caller", "target");
  expect(removeFriend).toHaveBeenCalledWith("caller", "target");
  jest.mocked(acceptFriend).mockResolvedValue(false);
  jest.mocked(removeFriend).mockResolvedValue(false);
  expect((await PUT(request("PUT"), { userId: "target" })).status).toBe(404);
  expect((await DELETE(request("DELETE"), { userId: "target" })).status).toBe(404);
});

test("returns a recoverable error when the database or session service is down", async () => {
  jest.mocked(friendList).mockRejectedValue(new Error("db"));
  expect((await GET(request("GET"))).status).toBe(503);
  jest.mocked(requestFriend).mockRejectedValue(new Error("db"));
  expect((await POST(request("POST", { code: "ABCD2345" }))).status).toBe(503);
  jest.mocked(sessionUser).mockRejectedValue(new Error("session"));
  expect((await DELETE(request("DELETE"), { userId: "target" })).status).toBe(503);
});

describe("presence and table invites", () => {
  test("a heartbeat marks the caller online and hands back their invites; guests are refused", async () => {
    jest.mocked(beat).mockResolvedValue({ cameOnline: true, announce: false });
    jest.mocked(takeInvites).mockResolvedValue([{ fromName: "Ada", roomId: "room1" }]);
    const response = await presencePOST(request("POST", { atTable: true }));
    expect(await response.json()).toEqual({ invites: [{ fromName: "Ada", roomId: "room1" }], emailVerified: false });
    expect(beat).toHaveBeenCalledWith("caller", true);
    jest.mocked(sessionUser).mockResolvedValue({ id: "caller", name: "Ada", anonymous: true });
    expect((await presencePOST(request("POST", {}))).status).toBe(403);
  });

  test("an invite needs a clean room id and a friend", async () => {
    jest.mocked(inviteToTable).mockResolvedValue(true);
    expect((await invitePOST(request("POST", { roomId: "room_1" }), { userId: "target" })).status).toBe(201);
    expect(inviteToTable).toHaveBeenCalledWith("caller", "target", "room_1");
    expect((await invitePOST(request("POST", { roomId: "a/../b" }), { userId: "target" })).status).toBe(400);
    jest.mocked(inviteToTable).mockResolvedValue(false);
    expect((await invitePOST(request("POST", { roomId: "room_1" }), { userId: "stranger" })).status).toBe(404);
  });
});

describe("push notifications", () => {
  test("coming online pushes accepted friends only when the throttle says to announce", async () => {
    jest.mocked(takeInvites).mockResolvedValue([]);
    jest.mocked(friendList).mockResolvedValue({ friends: [{ userId: "f1", name: "Bea" }], incoming: [], outgoing: [] });
    jest.mocked(beat).mockResolvedValue({ cameOnline: true, announce: false });
    await presencePOST(request("POST", {}));
    expect(notifyUsers).not.toHaveBeenCalled();
    jest.mocked(beat).mockResolvedValue({ cameOnline: true, announce: true });
    await presencePOST(request("POST", {}));
    expect(notifyUsers).toHaveBeenCalledWith(["f1"], "friendOnline", expect.anything());
  });

  test("an invite pushes an offline friend, with a link to the table, and an online one not at all", async () => {
    jest.mocked(inviteToTable).mockResolvedValue(true);
    jest.mocked(isOnline).mockResolvedValue(false);
    await invitePOST(request("POST", { roomId: "room_1" }), { userId: "target" });
    expect(notifyUsers).toHaveBeenCalledWith(["target"], "tableInvite", expect.objectContaining({ url: "wordpoker://online/room_1" }));
    jest.mocked(notifyUsers).mockClear();
    jest.mocked(isOnline).mockResolvedValue(true);
    await invitePOST(request("POST", { roomId: "room_1" }), { userId: "target" });
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  test("a new friend request pushes its recipient, a repeat does not", async () => {
    jest.mocked(requestFriend).mockResolvedValue("requested");
    await POST(request("POST", { code: "ABCD2345" }));
    expect(notifyUsers).toHaveBeenCalledWith(["target"], "friendRequest", expect.anything());
    jest.mocked(notifyUsers).mockClear();
    jest.mocked(requestFriend).mockResolvedValue("already-requested");
    await POST(request("POST", { code: "ABCD2345" }));
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  test("a token is registered for the caller only when it looks like an Expo token; guests are refused", async () => {
    expect((await pushPOST(request("POST", { token: "ExponentPushToken[abc]" }))).status).toBe(201);
    expect(savePushToken).toHaveBeenCalledWith("caller", "ExponentPushToken[abc]");
    for (const token of ["abc", "ExponentPushToken[" + "x".repeat(300) + "]", 5]) {
      expect((await pushPOST(request("POST", { token }))).status).toBe(400);
    }
    expect((await pushDELETE(request("DELETE", { token: "ExponentPushToken[abc]" }))).status).toBe(200);
    expect(deletePushToken).toHaveBeenCalledWith("caller", "ExponentPushToken[abc]");
    jest.mocked(sessionUser).mockResolvedValue({ id: "caller", name: "Ada", anonymous: true });
    expect((await pushPOST(request("POST", { token: "ExponentPushToken[abc]" }))).status).toBe(403);
  });
});
