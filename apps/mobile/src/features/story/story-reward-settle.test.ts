/** `settleStoryRewards`: which claims a save sends, in what order, and what a failure leaves for next time. */

import { STORY_CHAPTERS, type StoryProgress } from "@wordpoker/game-rules";

import { authClient } from "@/auth/client/auth-client";
import { settleStoryRewards } from "@/features/story/story-reward";

jest.mock("@/lib/network/api-base-url", () => ({ apiBaseURL: "http://api.test" }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { getCookie: jest.fn() } }));

const fetchMock = jest.fn();
const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PAID = { duplicate: false, xp: 50, level: 1 };
const cleared = (count: number): StoryProgress => ({
  chapters: Object.fromEntries(
    STORY_CHAPTERS.slice(0, count).map((chapter) => [chapter.id, { stars: {}, best: {}, bossCleared: true, powers: [], draft: null, bossLosses: 0 }]),
  ),
});
const claimed = (): string[] => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).chapterId);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(authClient.getCookie).mockResolvedValue("better-auth.session=abc");
  global.fetch = fetchMock as unknown as typeof fetch;
});

test("claims every beaten chapter in order, and each one once per player", async () => {
  fetchMock.mockImplementation(async () => reply(200, PAID));

  await expect(settleStoryRewards(cleared(2), "ann")).resolves.toEqual({ status: "paid", fresh: true });
  expect(claimed()).toEqual(["kitchen-table", "the-local"]);

  // The next boss: only the new chapter is asked for. Another player on the device starts over.
  await settleStoryRewards(cleared(3), "ann");
  expect(claimed().slice(2)).toEqual(["the-back-room"]);
  await settleStoryRewards(cleared(1), "bo");
  expect(claimed().slice(3)).toEqual(["kitchen-table"]);
});

test("a chapter already paid is not fresh", async () => {
  fetchMock.mockImplementation(async () => reply(200, { ...PAID, duplicate: true }));

  await expect(settleStoryRewards(cleared(1), "cy")).resolves.toEqual({ status: "paid", fresh: false });
});

test("asks for nothing with no boss beaten, or signed out", async () => {
  await expect(settleStoryRewards(cleared(0), "di")).resolves.toEqual({ status: "paid", fresh: false });
  await expect(settleStoryRewards(cleared(2), undefined)).resolves.toEqual({ status: "sign-in", fresh: false });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a guest or an unverified player is asked to sign in, and is paid on a later try", async () => {
  fetchMock.mockImplementationOnce(async () => reply(403, { error: "Verify your email to earn coins." }));
  await expect(settleStoryRewards(cleared(1), "ed")).resolves.toEqual({ status: "sign-in", fresh: false });

  fetchMock.mockImplementationOnce(async () => reply(401, { error: "Sign in to earn coins." }));
  await expect(settleStoryRewards(cleared(1), "ed")).resolves.toEqual({ status: "sign-in", fresh: false });

  fetchMock.mockImplementationOnce(async () => reply(200, PAID));
  await expect(settleStoryRewards(cleared(1), "ed")).resolves.toEqual({ status: "paid", fresh: true });
});

test("a failed claim stops there and leaves the rest for later", async () => {
  fetchMock.mockImplementationOnce(async () => reply(200, PAID)).mockRejectedValueOnce(new TypeError("Network request failed"));

  await expect(settleStoryRewards(cleared(3), "flo")).resolves.toEqual({ status: "later", fresh: true });
  expect(claimed()).toEqual(["kitchen-table", "the-local"]);

  fetchMock.mockImplementation(async () => reply(502, { error: "The reward could not be saved." }));
  await expect(settleStoryRewards(cleared(3), "flo")).resolves.toEqual({ status: "later", fresh: false });
  expect(claimed().slice(2)).toEqual(["the-local"]);
});
