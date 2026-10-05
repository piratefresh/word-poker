/**
 * The quests route: the session gate, the GET's credit-then-read order, and the POST's pass
 * through to `claimQuestHand`. `@wordpoker/economy` and `@wordpoker/db` are the seams; their own
 * suites judge the reward math and the storage.
 */

import { QUEST_IDS } from "@wordpoker/contracts";
import { questProgress } from "@wordpoker/db";
import { claimQuestHand, creditDailyStreak, payCompletedQuests } from "@wordpoker/economy";

import { GET, POST } from "@/app/api/quests+api";
import { auth } from "@/auth/server/auth";

jest.mock("@/auth/server/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@wordpoker/db", () => ({ questProgress: jest.fn() }));
jest.mock("@wordpoker/economy", () => ({
  creditDailyStreak: jest.fn(),
  payCompletedQuests: jest.fn(),
  claimQuestHand: jest.fn(),
}));

const getSession = jest.mocked(auth.api.getSession) as unknown as jest.Mock;
const credit = jest.mocked(creditDailyStreak);
const pay = jest.mocked(payCompletedQuests);
const progress = jest.mocked(questProgress);
const claim = jest.mocked(claimQuestHand);

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function request(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost:8081/api/quests", {
    method,
    headers: { cookie: "session=1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const VERIFIED = { user: { id: "user_1", emailVerified: true }, session: {} };
const UNVERIFIED = { user: { id: "user_1", emailVerified: false }, session: {} };

describe("GET /api/quests", () => {
  test("refuses without a session", async () => {
    getSession.mockResolvedValue(null);

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(credit).not.toHaveBeenCalled();
  });

  test("refuses an unverified email", async () => {
    getSession.mockResolvedValue(UNVERIFIED);

    const response = await GET(request("GET"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Verify your email to earn coins." });
    expect(credit).not.toHaveBeenCalled();
  });

  test("credits the streak, heals paid quests, then reads progress", async () => {
    getSession.mockResolvedValue(VERIFIED);
    const order: string[] = [];
    credit.mockImplementation(async () => {
      order.push("credit");
      return { current: 1, creditedToday: 50 };
    });
    pay.mockImplementation(async () => {
      order.push("pay");
    });
    progress.mockImplementation(async () => {
      order.push("progress");
      return [{ questId: "win-word-2", progress: 1, streak: 0, completedAt: new Date() }];
    });

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(order).toEqual(["credit", "pay", "progress"]);
    expect(credit).toHaveBeenCalledWith("user_1");
    expect(pay).toHaveBeenCalledWith("user_1");

    const body = await response.json();
    expect(body.streak).toEqual({ current: 1, creditedToday: 50 });
    expect(body.quests).toHaveLength(QUEST_IDS.length);
    expect(body.quests.find((q: { id: string }) => q.id === "win-word-2")).toEqual({
      id: "win-word-2",
      progress: 1,
      done: true,
    });
    expect(body.quests.find((q: { id: string }) => q.id === "hands-25")).toEqual({
      id: "hands-25",
      progress: 0,
      done: false,
    });
  });

  test("still reads progress when the credit or the heal throws", async () => {
    getSession.mockResolvedValue(VERIFIED);
    credit.mockRejectedValue(new Error("db down"));
    pay.mockRejectedValue(new Error("rc down"));
    progress.mockResolvedValue([]);

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.streak).toEqual({ current: 0, creditedToday: null });
  });

  test("answers 502 without the exception's text when progress cannot be read", async () => {
    getSession.mockResolvedValue(VERIFIED);
    credit.mockResolvedValue({ current: 1, creditedToday: null });
    pay.mockResolvedValue(undefined);
    progress.mockRejectedValue(new Error("DATABASE_URL=postgres://secret"));

    const response = await GET(request("GET"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Quests could not be read." });
  });
});

const CLAIM = {
  handToken: "token-1",
  facts: {
    revealed: true,
    heroWon: true,
    heroWord: "CAT",
    heroScore: 12,
    heroDecidedBy: "final-score",
    pot: 300,
    wildTable: false,
    heroUsedPower: false,
  },
};

describe("POST /api/quests", () => {
  test("refuses without a session", async () => {
    getSession.mockResolvedValue(null);

    expect((await POST(request("POST", CLAIM))).status).toBe(401);
    expect(claim).not.toHaveBeenCalled();
  });

  test("refuses an unverified email", async () => {
    getSession.mockResolvedValue(UNVERIFIED);

    expect((await POST(request("POST", CLAIM))).status).toBe(403);
    expect(claim).not.toHaveBeenCalled();
  });

  test("refuses a malformed claim", async () => {
    getSession.mockResolvedValue(VERIFIED);

    expect((await POST(request("POST", { nope: true }))).status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });

  test("passes a well-formed claim through and answers its result", async () => {
    getSession.mockResolvedValue(VERIFIED);
    claim.mockResolvedValue({ completed: ["win-word-2"], duplicate: false });

    const response = await POST(request("POST", CLAIM));

    expect(response.status).toBe(200);
    expect(claim).toHaveBeenCalledWith("user_1", CLAIM);
    await expect(response.json()).resolves.toEqual({ completed: ["win-word-2"], duplicate: false });
  });

  test("answers duplicate: true for a repeated hand token", async () => {
    getSession.mockResolvedValue(VERIFIED);
    claim.mockResolvedValue({ completed: [], duplicate: true });

    const response = await POST(request("POST", CLAIM));

    await expect(response.json()).resolves.toEqual({ completed: [], duplicate: true });
  });
});
