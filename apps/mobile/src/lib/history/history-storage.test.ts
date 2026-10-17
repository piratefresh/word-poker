import { readSessionPage, writeHistoryRow } from "./history-storage";
import type { LocalHistoryHand } from "./history-store";

// Run the native store's actual SQL against SQLite, without an Expo native runtime.
jest.mock("expo-sqlite", () => {
  const { DatabaseSync } = jest.requireActual("node:sqlite");
  const database = new DatabaseSync(":memory:");
  return {
    openDatabaseAsync: async () => ({
      execAsync: async (sql: string) => database.exec(sql),
      withTransactionAsync: async (work: () => Promise<void>) => work(),
      getFirstAsync: async (sql: string, ...args: unknown[]) => database.prepare(sql).get(...args),
      getAllAsync: async (sql: string, ...args: unknown[]) => database.prepare(sql).all(...args),
      runAsync: async (sql: string, ...args: unknown[]) => database.prepare(sql).run(...args),
    }),
  };
});

function row(
  sessionId: string,
  handNo: number,
  status: LocalHistoryHand["status"],
  end: number,
): LocalHistoryHand {
  return {
    hand: {
      id: `${sessionId}:${handNo}`,
      sessionId,
      handNo,
      mode: "offline",
      ranked: false,
      startedAtMs: end - 10,
      endedAtMs: end,
      dictionaryId: "en_US-large",
      heroId: "hero",
      seats: [],
      actions: [],
      summary: { outcome: "fold-out", community: [], seats: [], pots: [] },
    },
    status,
    error: status === "rejected" ? "Replay mismatch" : null,
    record: null,
    attempts: 0,
    retryAtMs: 0,
  };
}

test("native session paging aggregates older rejections, start times and pending hands within the account", async () => {
  await writeHistoryRow("a", "s:1", row("s", 1, "rejected", 100));
  await writeHistoryRow("a", "s:2", row("s", 2, "pending", 200));
  await writeHistoryRow("a", "s:3", row("s", 3, "synced", 300));
  await writeHistoryRow("b", "s:4", row("s", 4, "synced", 999));
  await writeHistoryRow("a", "old:1", row("old", 1, "synced", 50));
  const [session] = await readSessionPage("a", null, 1);
  expect(session).toMatchObject({
    sessionId: "s",
    startedAtMs: 90,
    endedAtMs: 300,
    hands: 3,
    pending: true,
    rejected: [{ handNo: 1, reason: "Replay mismatch" }],
    latest: { hand: { handNo: 3 } },
  });
  expect(await readSessionPage("a", { sessionId: "s", endedAtMs: 300 }, 1)).toMatchObject([
    { sessionId: "old", rejected: [] },
  ]);
  expect(await readSessionPage("b", null, 20)).toMatchObject([
    { sessionId: "s", hands: 1, rejected: [] },
  ]);
});
