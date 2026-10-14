import { friendCode, friendList, requestFriend, userForFriendCode, acceptFriend, removeFriend } from "@wordpoker/db";
import { GET, POST } from "@/app/api/friends+api";
import { PUT, DELETE } from "@/app/api/friends/[userId]+api";
import { sessionUser } from "@/auth/server/session-user";

jest.mock("@wordpoker/db", () => ({ friendCode: jest.fn(), friendList: jest.fn(), requestFriend: jest.fn(), userForFriendCode: jest.fn(), acceptFriend: jest.fn(), removeFriend: jest.fn() }));
jest.mock("@/auth/server/session-user", () => ({ sessionUser: jest.fn() }));

function request(method: string, body?: unknown) {
  return new Request("https://api.test/api/friends", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(sessionUser).mockResolvedValue({ id: "caller", anonymous: false });
  jest.mocked(friendCode).mockResolvedValue("ABCD2345");
  jest.mocked(friendList).mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
  jest.mocked(userForFriendCode).mockResolvedValue("target");
});

test.each([null, { id: "caller", anonymous: true }])("rejects every route for missing or guest sessions: %j", async (user) => {
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
  expect(await response.json()).toEqual({ code: "ABCD2345", friends: [], incoming: [], outgoing: [] });
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
