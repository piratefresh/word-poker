import type { HandCursor, HistorySession, LocalHistoryHand, SessionCursor } from "./history-store";

let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wordpoker-history", 1);
    request.onupgradeneeded = () => {
      const value = request.result;
      if (!value.objectStoreNames.contains("hands")) value.createObjectStore("hands", { keyPath: "key" }).createIndex("owner", "owner");
      if (!value.objectStoreNames.contains("cursors")) value.createObjectStore("cursors");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Word Poker tabs to update saved history."));
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

async function transaction<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode, { durability: "strict" });
    const request = work(tx.objectStore(store));
    // A successful request is not a durable commit: wait for the transaction itself.
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("History save was interrupted."));
  });
}

// IndexedDB has no group-by, so the web fork reads the account's rows and pages them in memory;
// the same cursors as the native store keep callers identical.
async function ownerRows(owner: string): Promise<LocalHistoryHand[]> {
  const rows = await transaction<{ row: LocalHistoryHand }[]>("hands", "readonly", (store) => store.index("owner").getAll(owner));
  return rows.map((entry) => entry.row);
}
const rowId = (row: LocalHistoryHand) => `${row.hand.sessionId}:${row.hand.handNo}`;
const newestFirst = (a: LocalHistoryHand, b: LocalHistoryHand) => b.hand.endedAtMs - a.hand.endedAtMs || (rowId(a) < rowId(b) ? 1 : -1);

export async function readHistoryRow(owner: string, id: string): Promise<LocalHistoryHand | null> {
  return (await transaction<{ row: LocalHistoryHand } | undefined>("hands", "readonly", (store) => store.get(`${owner}:${id}`)))?.row ?? null;
}
export async function readPendingRows(owner: string): Promise<LocalHistoryHand[]> {
  return (await ownerRows(owner)).filter((row) => row.status === "pending").sort(newestFirst);
}
export async function countPendingSessions(owner: string): Promise<number> {
  return new Set((await readPendingRows(owner)).map((row) => row.hand.sessionId)).size;
}
export async function readSessionPage(owner: string, after: SessionCursor | null, limit: number): Promise<HistorySession[]> {
  const sessions = new Map<string, HistorySession>();
  for (const row of (await ownerRows(owner)).sort(newestFirst)) {
    const session = sessions.get(row.hand.sessionId);
    if (session) {
      session.hands += 1;
      session.pending ||= row.status === "pending";
      session.startedAtMs = Math.min(session.startedAtMs, row.hand.startedAtMs);
    } else sessions.set(row.hand.sessionId, { sessionId: row.hand.sessionId, endedAtMs: row.hand.endedAtMs,
      startedAtMs: row.hand.startedAtMs, hands: 1, pending: row.status === "pending", rejected: [], latest: row });
    if (row.status === "rejected") sessions.get(row.hand.sessionId)?.rejected.push({
      handNo: row.hand.handNo, reason: row.error ?? "The hand could not be verified. It stays on this device, unranked.",
    });
  }
  return [...sessions.values()]
    .sort((a, b) => b.endedAtMs - a.endedAtMs || (a.sessionId < b.sessionId ? 1 : -1))
    .filter((session) => !after || session.endedAtMs < after.endedAtMs || (session.endedAtMs === after.endedAtMs && session.sessionId < after.sessionId))
    .slice(0, limit);
}
export async function readHandPage(owner: string, sessionId: string, after: HandCursor | null, limit: number): Promise<LocalHistoryHand[]> {
  return (await ownerRows(owner)).filter((row) => row.hand.sessionId === sessionId).sort(newestFirst)
    .filter((row) => !after || row.hand.endedAtMs < after.endedAtMs || (row.hand.endedAtMs === after.endedAtMs && rowId(row) < after.id))
    .slice(0, limit);
}
export async function writeHistoryRow(owner: string, id: string, row: LocalHistoryHand): Promise<void> {
  await transaction("hands", "readwrite", (store) => store.put({ key: `${owner}:${id}`, owner, row }));
}
export async function readHistoryCursor(owner: string): Promise<string | null> {
  return await transaction<string | undefined>("cursors", "readonly", (store) => store.get(owner)) ?? null;
}
export async function writeHistoryCursor(owner: string, cursor: string | null): Promise<void> {
  await transaction("cursors", "readwrite", (store) => store.put(cursor, owner));
}
