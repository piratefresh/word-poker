import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { HandCursor, HistorySession, LocalHistoryHand, SessionCursor } from "./history-store";

let database: Promise<SQLiteDatabase> | undefined;
async function db(): Promise<SQLiteDatabase> {
  if (!database) database = openDatabaseAsync("wordpoker-history.db").then(async (value) => {
    await value.execAsync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS history_rows (owner TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner, id));
      CREATE TABLE IF NOT EXISTS history_cursors (owner TEXT PRIMARY KEY, cursor TEXT);`);
    // v2 lifts what paging sorts and groups on out of the payload, so a page never parses the rest.
    const version = (await value.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version ?? 0;
    if (version < 2) await value.withTransactionAsync(async () => {
      await value.execAsync(`ALTER TABLE history_rows ADD COLUMN session_id TEXT;
        ALTER TABLE history_rows ADD COLUMN ended_at INTEGER;
        ALTER TABLE history_rows ADD COLUMN status TEXT;
        UPDATE history_rows SET session_id = json_extract(payload, '$.hand.sessionId'),
          ended_at = json_extract(payload, '$.hand.endedAtMs'), status = json_extract(payload, '$.status');
        CREATE INDEX history_rows_session ON history_rows(owner, session_id, ended_at DESC, id DESC);
        CREATE INDEX history_rows_status ON history_rows(owner, status);
        PRAGMA user_version = 2;`);
    });
    return value;
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

const parse = (rows: { payload: string }[]): LocalHistoryHand[] => rows.map((row) => JSON.parse(row.payload));

export async function readHistoryRow(owner: string, id: string): Promise<LocalHistoryHand | null> {
  const row = await (await db()).getFirstAsync<{ payload: string }>("SELECT payload FROM history_rows WHERE owner = ? AND id = ?", owner, id);
  return row ? JSON.parse(row.payload) : null;
}
export async function readPendingRows(owner: string): Promise<LocalHistoryHand[]> {
  return parse(await (await db()).getAllAsync<{ payload: string }>(
    "SELECT payload FROM history_rows WHERE owner = ? AND status = 'pending' ORDER BY ended_at DESC, id DESC", owner));
}
/** Newest session first. `payload` is the session's latest hand: a bare column beside a lone MAX() takes that row's value. */
export async function readSessionPage(owner: string, after: SessionCursor | null, limit: number): Promise<HistorySession[]> {
  const at = after?.endedAtMs ?? null;
  const id = after?.sessionId ?? null;
  const rows = await (await db()).getAllAsync<{ payload: string; sessionId: string; endedAtMs: number; hands: number; pending: number }>(
    `SELECT payload, session_id AS sessionId, MAX(ended_at) AS endedAtMs, COUNT(*) AS hands, SUM(status = 'pending') AS pending
     FROM history_rows WHERE owner = ? GROUP BY session_id
     HAVING ? IS NULL OR MAX(ended_at) < ? OR (MAX(ended_at) = ? AND session_id < ?)
     ORDER BY endedAtMs DESC, session_id DESC LIMIT ?`, owner, at, at, at, id, limit);
  return rows.map(({ payload, pending, ...session }) => ({ ...session, pending: pending > 0, latest: JSON.parse(payload) }));
}
export async function readHandPage(owner: string, sessionId: string, after: HandCursor | null, limit: number): Promise<LocalHistoryHand[]> {
  const at = after?.endedAtMs ?? null;
  return parse(await (await db()).getAllAsync<{ payload: string }>(
    `SELECT payload FROM history_rows WHERE owner = ? AND session_id = ?
     AND (? IS NULL OR ended_at < ? OR (ended_at = ? AND id < ?))
     ORDER BY ended_at DESC, id DESC LIMIT ?`, owner, sessionId, at, at, at, after?.id ?? null, limit));
}
export async function writeHistoryRow(owner: string, id: string, row: LocalHistoryHand): Promise<void> {
  await (await db()).runAsync(`INSERT INTO history_rows(owner, id, payload, session_id, ended_at, status) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, id) DO UPDATE SET payload = excluded.payload, session_id = excluded.session_id,
      ended_at = excluded.ended_at, status = excluded.status`,
    owner, id, JSON.stringify(row), row.hand.sessionId, row.hand.endedAtMs, row.status);
}
export async function readHistoryCursor(owner: string): Promise<string | null> {
  return (await (await db()).getFirstAsync<{ cursor: string | null }>("SELECT cursor FROM history_cursors WHERE owner = ?", owner))?.cursor ?? null;
}
export async function writeHistoryCursor(owner: string, cursor: string | null): Promise<void> {
  await (await db()).runAsync(`INSERT INTO history_cursors(owner, cursor) VALUES (?, ?)
    ON CONFLICT(owner) DO UPDATE SET cursor = excluded.cursor`, owner, cursor);
}
