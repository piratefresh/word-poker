import { auth } from "./auth";
import { sessionUser } from "./session-user";

jest.mock("./auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

const getSession = jest.mocked(auth.api.getSession);

function session(expiresAt = new Date(Date.now() + 60000)): typeof auth.$Infer.Session {
  const now = new Date();
  return {
    user: { id: "account-a", name: "A", email: "a@example.test", emailVerified: true, isAnonymous: false, notifyTableInvite: true, notifyFriendRequest: true, notifyFriendOnline: false, createdAt: now, updatedAt: now },
    session: { id: "session-a", userId: "account-a", token: "session-token", expiresAt, createdAt: now, updatedAt: now },
  };
}

test.each(["web", "native"])("resolves %s history ownership from the session and ignores supplied account IDs", async () => {
  getSession.mockResolvedValue(session());
  const request = new Request("https://api.test/api/history/hands?userId=account-b", {
    method: "POST", headers: { cookie: "better-auth.session_token=session-a" },
    body: JSON.stringify({ ownerId: "account-b" }),
  });
  await expect(sessionUser(request)).resolves.toEqual({ id: "account-a", name: "A", anonymous: false });
  expect(getSession).toHaveBeenCalledWith({ headers: request.headers, query: { disableCookieCache: true } });
});

test("rejects missing and expired sessions", async () => {
  getSession.mockResolvedValueOnce(null);
  await expect(sessionUser(new Request("https://api.test/api/history/hands"))).resolves.toBeNull();
  getSession.mockResolvedValueOnce(session(new Date(0)));
  await expect(sessionUser(new Request("https://api.test/api/history/hands"))).resolves.toBeNull();
});

test("identifies guest sessions", async () => {
  const guest = session();
  guest.user.isAnonymous = true;
  getSession.mockResolvedValueOnce(guest);
  await expect(sessionUser(new Request("https://api.test/api/friends"))).resolves.toEqual({ id: "account-a", name: "A", anonymous: true });
});
