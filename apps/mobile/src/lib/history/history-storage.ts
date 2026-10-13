import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { LocalHistoryHand } from "./history-store";

let database: Promise<SQLiteDatabase> | undefined;
async function db(): Promise<SQLiteDatabase> {
  if (!database) database = openDatabaseAsync("wordpoker-history.db").then(async (value) => {
    await value.execAsync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS history_rows (owner TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner, id));
      CREATE TABLE IF NOT EXISTS history_cursors (owner TEXT PRIMARY KEY, cursor TEXT);
      PRAGMA user_version = 1;`);
    return value;
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

export async function readHistoryRows(owner: string): Promise<LocalHistoryHand[]> {
  const rows = await (await db()).getAllAsync<{ payload: string }>("SELECT payload FROM history_rows WHERE owner = ?", owner);
  return rows.map((row) => JSON.parse(row.payload));
}
export async function writeHistoryRow(owner: string, id: string, row: LocalHistoryHand): Promise<void> {
  await (await db()).runAsync(`INSERT INTO history_rows(owner, id, payload) VALUES (?, ?, ?)
    ON CONFLICT(owner, id) DO UPDATE SET payload = excluded.payload`, owner, id, JSON.stringify(row));
}
export async function readHistoryCursor(owner: string): Promise<string | null> {
  return (await (await db()).getFirstAsync<{ cursor: string | null }>("SELECT cursor FROM history_cursors WHERE owner = ?", owner))?.cursor ?? null;
}
export async function writeHistoryCursor(owner: string, cursor: string | null): Promise<void> {
  await (await db()).runAsync(`INSERT INTO history_cursors(owner, cursor) VALUES (?, ?)
    ON CONFLICT(owner) DO UPDATE SET cursor = excluded.cursor`, owner, cursor);
}
