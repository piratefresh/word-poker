import { historyHand, type HandRecord, type HistoryHand } from "@wordpoker/contracts";
import { readHistoryRows, writeHistoryRow, readHistoryCursor, writeHistoryCursor } from "./history-storage";

export interface LocalHistoryHand {
  hand: HistoryHand;
  status: "pending" | "synced" | "rejected";
  error: string | null;
  record: HandRecord | null;
  attempts: number;
  retryAtMs: number;
}

export function localHistoryId(hand: Pick<HistoryHand, "sessionId" | "handNo">): string {
  return `${hand.sessionId}:${hand.handNo}`;
}

/** Resolves only after commit; the table holds settlement until then. */
export async function captureHistoryHand(ownerId: string, record: HandRecord): Promise<void> {
  const id = localHistoryId(record);
  const existing = (await readHistoryRows(ownerId)).find((row) => localHistoryId(row.hand) === id);
  if (existing) {
    if (existing.record && JSON.stringify(existing.record) !== JSON.stringify(record)) throw new Error("Conflicting saved hand.");
    return;
  }
  await writeHistoryRow(ownerId, id, {
    hand: historyHand(record, id, "hero"), record, status: "pending", error: null,
    attempts: 0, retryAtMs: 0,
  });
}

export async function localHistory(ownerId: string): Promise<LocalHistoryHand[]> {
  return (await readHistoryRows(ownerId)).sort((a, b) => b.hand.endedAtMs - a.hand.endedAtMs || b.hand.id.localeCompare(a.hand.id));
}

export async function acceptHistoryHand(ownerId: string, hand: HistoryHand): Promise<void> {
  await writeHistoryRow(ownerId, localHistoryId(hand), {
    hand, record: null, status: "synced", error: null, attempts: 0, retryAtMs: 0,
  });
}

export async function historyRetry(ownerId: string, id: string, error: string, permanent: boolean, attempts: number): Promise<void> {
  const row = (await readHistoryRows(ownerId)).find((entry) => localHistoryId(entry.hand) === id);
  if (!row || row.status === "synced") return;
  await writeHistoryRow(ownerId, id, {
    ...row, status: permanent ? "rejected" : "pending", error, attempts,
    retryAtMs: Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8)),
  });
}

export const historyCursor = readHistoryCursor;
export const setHistoryCursor = writeHistoryCursor;
