import { createDictionary, DICTIONARIES, loadDictionary, reduce, startHand } from "@wordpoker/game-rules";
import { HandRecordConflictError, readHistoryHands, saveHistoryHand } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";
import { OfflineHandRecorder } from "./hand-recorder";
import { GET, POST } from "@/app/api/history/hands+api";

jest.mock("@/auth/server/session-user", () => ({ sessionUser: jest.fn() }));
jest.mock("@wordpoker/db", () => ({
  readHistoryHands: jest.fn(), saveHistoryHand: jest.fn(),
  HandRecordConflictError: class HandRecordConflictError extends Error {},
}));
jest.mock("@wordpoker/game-rules", () => ({
  ...jest.requireActual("@wordpoker/game-rules"), loadDictionary: jest.fn(),
}));

const dictionary = createDictionary({ id: "en_US-large", label: DICTIONARIES["en_US-large"].label,
  source: { file: "fixture", sha256: "a".repeat(64), lines: 1 }, count: 1, words: ["AA"] });

function record() {
  const state = startHand({ seed: 42, players: ["hero", "bot"], nowMs: 1000, dictionary });
  const recorder = new OfflineHandRecorder(state, 1000, "a");
  const action = { type: "fold", playerId: state.seats[state.toActIndex ?? 0].id } as const;
  const result = recorder.transition(state, reduce(state, action, 1100), action, 1100);
  if (!result) throw new Error("Unsettled fixture.");
  return result;
}

function request(value: unknown) {
  return new Request("https://api.test/api/history/hands", { method: "POST", body: JSON.stringify(value) });
}

beforeEach(() => {
  jest.mocked(sessionUser).mockResolvedValue({ id: "a", name: "Ada", anonymous: false });
  jest.mocked(saveHistoryHand).mockReset().mockResolvedValue({ status: "recorded", id: "server-id" });
  jest.mocked(loadDictionary).mockResolvedValue(dictionary);
});

test("requires authentication, enforces offline ownership/ranking, and bounds the upload", async () => {
  jest.mocked(sessionUser).mockResolvedValueOnce(null);
  expect((await POST(request(record()))).status).toBe(401);
  expect((await POST(request({ ...record(), ranked: true }))).status).toBe(400);
  jest.mocked(sessionUser).mockResolvedValueOnce({ id: "b", name: "Ada", anonymous: false });
  expect((await POST(request(record()))).status).toBe(400);
  expect((await POST(request("x".repeat(512 * 1024)))).status).toBe(413);
  expect(saveHistoryHand).not.toHaveBeenCalled();
});

test("replays before writing and returns the canonical visible hand; forged scores never write", async () => {
  const hand = record();
  const response = await POST(request(hand));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ id: "server-id", ranked: false, heroId: "hero" });
  expect(saveHistoryHand).toHaveBeenCalledWith(hand, { ownerId: "a" });
  jest.mocked(saveHistoryHand).mockClear();
  const forged = { ...hand, summary: { ...hand.summary, seats: hand.summary.seats.map((seat) => ({ ...seat, score: 100 })) } };
  expect((await POST(request(forged))).status).toBe(422);
  expect(saveHistoryHand).not.toHaveBeenCalled();
});

test("conflicting identities fail and list requests use verified identity and insertion cursor", async () => {
  jest.mocked(saveHistoryHand).mockRejectedValueOnce(new HandRecordConflictError("session", 1));
  expect((await POST(request(record()))).status).toBe(409);
  jest.mocked(readHistoryHands).mockResolvedValue({ hands: [], cursor: "h1:7", hasMore: false });
  expect((await GET(new Request("https://api.test/api/history/hands?cursor=h1%3A7&userId=b"))).status).toBe(200);
  expect(readHistoryHands).toHaveBeenCalledWith("a", "h1:7");
  expect((await GET(new Request("https://api.test/api/history/hands?cursor=broken"))).status).toBe(400);
});
