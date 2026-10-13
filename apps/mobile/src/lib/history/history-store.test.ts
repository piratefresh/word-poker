import { createDictionary, DICTIONARIES, reduce, startHand } from "@wordpoker/game-rules";
import { historyHand, type HandRecord } from "@wordpoker/contracts";
import { OfflineHandRecorder } from "./hand-recorder";
import { acceptHistoryHand, captureHistoryHand, historyRetry, localHistory, localHistoryId } from "./history-store";
import { syncHistory } from "./history-sync";
import { authClient } from "@/auth/client/auth-client";

jest.mock("./history-storage", () => {
  const disk = new Map<string, unknown>();
  const cursors = new Map<string, string>();
  return {
    readHistoryRows: async (owner: string) => [...disk.entries()].filter(([key]) => key.startsWith(`${owner}:`)).map(([, row]) => structuredClone(row)),
    writeHistoryRow: async (owner: string, id: string, row: unknown) => { disk.set(`${owner}:${id}`, structuredClone(row)); },
    readHistoryCursor: async (owner: string) => cursors.get(owner) ?? null,
    writeHistoryCursor: async (owner: string, cursor: string) => { cursors.set(owner, cursor); },
    reset: () => { disk.clear(); cursors.clear(); },
  };
});
jest.mock("@/auth/client/auth-client", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("@/lib/api-base-url", () => ({ apiBaseURL: "https://api.test" }));

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
