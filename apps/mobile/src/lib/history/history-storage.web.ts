import type { LocalHistoryHand } from "./history-store";

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

export async function readHistoryRows(owner: string): Promise<LocalHistoryHand[]> {
  const rows = await transaction<{ row: LocalHistoryHand }[]>("hands", "readonly", (store) => store.index("owner").getAll(owner));
  return rows.map((entry) => entry.row);
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
