import { createDictionary, DICTIONARIES, reduce, startHand } from "@wordpoker/game-rules";
import { historyHand, type HandRecord } from "@wordpoker/contracts";
import { OfflineHandRecorder } from "./hand-recorder";
import { acceptHistoryHand, captureHistoryHand, historyRetry, localHistoryId, sessionStatus, type HistorySession } from "./history-store";
import { syncHistory } from "./history-sync";
import { authClient } from "@/auth/client/auth-client";

jest.mock("./history-storage", () => {
  const disk = new Map<string, unknown>();
  const cursors = new Map<string, string>();
  return {
    allRows: (owner: string) => [...disk.entries()].filter(([key]) => key.startsWith(`${owner}:`)).map(([, row]) => structuredClone(row)),
    readHistoryRow: async (owner: string, id: string) => structuredClone(disk.get(`${owner}:${id}`) ?? null),
    readPendingRows: async (owner: string) => jest.requireMock("./history-storage").allRows(owner)
      .filter((row: { status: string }) => row.status === "pending")
      .sort((a: { hand: { endedAtMs: number } }, b: { hand: { endedAtMs: number } }) => b.hand.endedAtMs - a.hand.endedAtMs),
    writeHistoryRow: async (owner: string, id: string, row: unknown) => { disk.set(`${owner}:${id}`, structuredClone(row)); },
    readHistoryCursor: async (owner: string) => cursors.get(owner) ?? null,
    writeHistoryCursor: async (owner: string, cursor: string) => { cursors.set(owner, cursor); },
    reset: () => { disk.clear(); cursors.clear(); },
  };
});
jest.mock("@/auth/client/auth-client", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("@/lib/network/api-base-url", () => ({ apiBaseURL: "https://api.test" }));

const localHistory = (owner: string): { hand: { sessionId: string }; status: string; attempts: number; error: string | null }[] => jest.requireMock("./history-storage").allRows(owner);

function settled(): HandRecord {
  const dictionary = createDictionary({ id: "en_US-large", label: DICTIONARIES["en_US-large"].label,
    source: { file: "fixture", sha256: "a".repeat(64), lines: 1 }, count: 1, words: ["AA"] });
  const state = startHand({ seed: 42, players: ["hero", "bot"], nowMs: 1000, dictionary });
  const recorder = new OfflineHandRecorder(state, 1000, "a");
  const action = { type: "fold", playerId: state.seats[state.toActIndex ?? 0].id } as const;
  const record = recorder.transition(state, reduce(state, action, 1100), action, 1100);
  if (!record) throw new Error("Fixture did not settle.");
  return record;
}

beforeEach(() => {
  jest.requireMock("./history-storage").reset();
  jest.mocked(authClient.getSession).mockResolvedValue({ data: { user: { id: "a" }, session: { token: "account-a-token" } }, error: null } as never);
});

test("pending rows remain account-scoped, conflicts fail, and acknowledgment replaces the visible row", async () => {
  const record = settled();
  await captureHistoryHand("a", record);
  await captureHistoryHand("a", record);
  expect(await localHistory("a")).toHaveLength(1);
  expect(await localHistory("b")).toEqual([]);
  await expect(captureHistoryHand("a", { ...record, seed: 99 })).rejects.toThrow("Conflicting");
  await historyRetry("a", localHistoryId(record), "offline", false, 1);
  expect((await localHistory("a"))[0]).toMatchObject({ status: "pending", attempts: 1 });
  await acceptHistoryHand("a", historyHand(record, "server-id", "hero"));
  expect(await localHistory("a")).toHaveLength(1);
  expect((await localHistory("a"))[0]).toMatchObject({ status: "synced", record: null });
});

test("an ambiguous upload stays pending, and switching accounts never sends its payload", async () => {
  const record = settled();
  await captureHistoryHand("a", record);
  const fetchMock = jest.fn().mockRejectedValue(new Error("connection lost after commit"));
  global.fetch = fetchMock;
  await expect(syncHistory("a", () => {})).rejects.toThrow("connection lost");
  expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/history/hands", expect.objectContaining({
    credentials: "omit", headers: { authorization: "Bearer account-a-token", "content-type": "application/json" },
  }));
  expect((await localHistory("a"))[0].status).toBe("pending");
  fetchMock.mockClear();
  jest.mocked(authClient.getSession).mockResolvedValue({ data: { user: { id: "b" } }, error: null } as never);
  await expect(syncHistory("a", () => {})).rejects.toThrow("Sign in to this account");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a non-JSON permanent rejection does not block later uploads or the history pull", async () => {
  const accepted = settled();
  const rejected = { ...settled(), endedAtMs: accepted.endedAtMs + 1 };
  await captureHistoryHand("a", rejected);
  await captureHistoryHand("a", accepted);
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 413, json: async () => { throw new SyntaxError("HTML response"); } })
    .mockResolvedValueOnce({ ok: true, json: async () => historyHand(accepted, accepted.sessionId, "hero") })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ hands: [], cursor: null, hasMore: false }) });
  global.fetch = fetchMock;
  await syncHistory("a", () => {});
  const rows = await localHistory("a");
  expect(rows.find((row) => row.hand.sessionId === rejected.sessionId)).toMatchObject({
    status: "rejected", error: "Hand upload failed.", attempts: 1,
  });
  expect(rows.find((row) => row.hand.sessionId === accepted.sessionId)?.status).toBe("synced");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("a non-JSON gateway failure remains retryable with the upload error", async () => {
  await captureHistoryHand("a", settled());
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 502, json: async () => { throw new SyntaxError("HTML response"); },
  });
  await expect(syncHistory("a", () => {})).rejects.toThrow("Hand upload failed.");
  expect((await localHistory("a"))[0]).toMatchObject({ status: "pending", error: "Hand upload failed.", attempts: 1 });
});

test("sessionStatus maps all five states, including an older rejection and only the active upload", () => {
  const session = (mode: "offline" | "online", extra: Partial<HistorySession> = {}) =>
    ({ sessionId: "s", pending: false, rejected: [], latest: { hand: { mode } }, ...extra }) as unknown as HistorySession;
  expect(sessionStatus(session("online"))).toBe("synced");
  expect(sessionStatus(session("offline", { pending: true }))).toBe("onDevice");
  expect(sessionStatus(session("offline", { pending: true }), "s")).toBe("uploading");
  expect(sessionStatus(session("offline", { pending: true }), "another-session")).toBe("onDevice");
  expect(sessionStatus(session("offline"))).toBe("verified");
  expect(sessionStatus(session("offline", { pending: true, rejected: [{ handNo: 1, reason: "Mismatch" }] }), "s")).toBe("rejected");
});
