/**
 * The story reward claim: the client's view of `POST /api/story-rewards`, and the route itself
 * over a mocked `@wordpoker/economy` (whose own suite judges the payout and its guards).
 */

import { claimStoryReward as payStoryReward } from "@wordpoker/economy";

import { POST } from "@/app/api/story-rewards+api";
import { authClient } from "@/auth/client/auth-client";
import { auth } from "@/auth/server/auth";
import { claimStoryReward } from "@/features/story/story-reward";
import { WalletAuthError, WalletUnverifiedError } from "@/lib/wallet/wallet-client";

jest.mock("@/lib/network/api-base-url", () => ({ apiBaseURL: "http://api.test" }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { getCookie: jest.fn() } }));
jest.mock("@/auth/server/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@wordpoker/economy", () => ({ claimStoryReward: jest.fn() }));

const getSession = jest.mocked(auth.api.getSession) as unknown as jest.Mock;
const pay = jest.mocked(payStoryReward);
const fetchMock = jest.fn();

const VERIFIED = { user: { id: "user_1", emailVerified: true }, session: {} };
const UNVERIFIED = { user: { id: "user_1", emailVerified: false }, session: {} };

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function request(body: unknown): Request {
  return new Request("http://localhost:8081/api/story-rewards", {
    method: "POST",
    headers: { cookie: "session=1", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(authClient.getCookie).mockResolvedValue("better-auth.session=abc");
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("claimStoryReward (client)", () => {
  test("posts the chapter id with the session and reads a first claim", async () => {
    fetchMock.mockResolvedValue(reply(200, { duplicate: false, xp: 50, level: 1 }));

    await expect(claimStoryReward("kitchen-table")).resolves.toEqual({
      ok: true,
      response: { duplicate: false, xp: 50, level: 1 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/story-rewards");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ chapterId: "kitchen-table" }),
      headers: { cookie: "better-auth.session=abc", "content-type": "application/json" },
    });
  });

  test("reads a repeat claim as a duplicate", async () => {
    fetchMock.mockResolvedValue(reply(200, { duplicate: true, xp: 50, level: 1 }));

    await expect(claimStoryReward("kitchen-table")).resolves.toEqual({
      ok: true,
      response: { duplicate: true, xp: 50, level: 1 },
    });
  });

  test("resolves an out-of-order chapter and an unknown one as refusals", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { error: "Clear the chapter before this one first." }));
    await expect(claimStoryReward("the-local")).resolves.toEqual({ ok: false, reason: "out_of_order" });

    fetchMock.mockResolvedValueOnce(reply(404, { error: "There is no such chapter." }));
    await expect(claimStoryReward("nope")).resolves.toEqual({ ok: false, reason: "unknown_chapter" });
  });

  test("rejects on a 401 and a 403 with the wallet's errors", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: "Sign in to earn coins." }));
    await expect(claimStoryReward("kitchen-table")).rejects.toBeInstanceOf(WalletAuthError);

    fetchMock.mockResolvedValueOnce(reply(403, { error: "Verify your email to earn coins." }));
    await expect(claimStoryReward("kitchen-table")).rejects.toBeInstanceOf(WalletUnverifiedError);
  });

  test("refuses a result it cannot read", async () => {
    fetchMock.mockResolvedValue(reply(200, { duplicate: "maybe" }));

    await expect(claimStoryReward("kitchen-table")).rejects.toThrow("could not be read");
  });
});

describe("POST /api/story-rewards", () => {
  test("refuses without a session", async () => {
    getSession.mockResolvedValue(null);

    const response = await POST(request({ chapterId: "kitchen-table" }));

    expect(response.status).toBe(401);
    expect(pay).not.toHaveBeenCalled();
  });

  test("refuses an unverified account", async () => {
    getSession.mockResolvedValue(UNVERIFIED);

    const response = await POST(request({ chapterId: "kitchen-table" }));

    expect(response.status).toBe(403);
    expect(pay).not.toHaveBeenCalled();
  });

  test("refuses a malformed body without paying", async () => {
    getSession.mockResolvedValue(VERIFIED);

    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request({ chapterId: "" }))).status).toBe(400);
    expect((await POST(request({ chapter: "kitchen-table" }))).status).toBe(400);
    expect(pay).not.toHaveBeenCalled();
  });

  test("pays the session's player for the named chapter, never an amount from the body", async () => {
    getSession.mockResolvedValue(VERIFIED);
    pay.mockResolvedValue({ ok: true, response: { duplicate: false, xp: 50, level: 1 } });

    const response = await POST(request({ chapterId: "kitchen-table", coins: 1_000_000, xp: 1_000_000 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ duplicate: false, xp: 50, level: 1 });
    expect(pay).toHaveBeenCalledWith("user_1", "kitchen-table");
  });

  test("answers a repeat claim with 200 and duplicate", async () => {
    getSession.mockResolvedValue(VERIFIED);
    pay.mockResolvedValue({ ok: true, response: { duplicate: true, xp: 50, level: 1 } });

    const response = await POST(request({ chapterId: "kitchen-table" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ duplicate: true, xp: 50, level: 1 });
  });

  test("maps an out-of-order chapter to 409 and an unknown one to 404", async () => {
    getSession.mockResolvedValue(VERIFIED);

    pay.mockResolvedValueOnce({ ok: false, reason: "out_of_order" });
    expect((await POST(request({ chapterId: "the-local" }))).status).toBe(409);

    pay.mockResolvedValueOnce({ ok: false, reason: "unknown_chapter" });
    expect((await POST(request({ chapterId: "nope" }))).status).toBe(404);
  });

  test("answers 502 when the payout throws", async () => {
    getSession.mockResolvedValue(VERIFIED);
    pay.mockRejectedValue(new Error("db down"));

    const response = await POST(request({ chapterId: "kitchen-table" }));

    expect(response.status).toBe(502);
  });
});
