import { historyHand, type HandRecord, type HistoryHand } from "@wordpoker/contracts";
import { readHandPage, readHistoryRow, readPendingRows, readSessionPage, writeHistoryRow, readHistoryCursor, writeHistoryCursor } from "./history-storage";

export interface LocalHistoryHand {
  hand: HistoryHand;
  status: "pending" | "synced" | "rejected";
  error: string | null;
  record: HandRecord | null;
  attempts: number;
  retryAtMs: number;
}

/** A session's card: its newest hand plus the counts the list shows. */
export interface HistorySession {
  sessionId: string;
  endedAtMs: number;
  hands: number;
  pending: boolean;
  latest: LocalHistoryHand;
}
export interface SessionCursor { endedAtMs: number; sessionId: string }
export interface HandCursor { endedAtMs: number; id: string }

export function localHistoryId(hand: Pick<HistoryHand, "sessionId" | "handNo">): string {
  return `${hand.sessionId}:${hand.handNo}`;
}

/** Resolves only after commit; the table holds settlement until then. */
export async function captureHistoryHand(ownerId: string, record: HandRecord): Promise<void> {
  const id = localHistoryId(record);
  const existing = await readHistoryRow(ownerId, id);
  if (existing) {
    if (existing.record && JSON.stringify(existing.record) !== JSON.stringify(record)) throw new Error("Conflicting saved hand.");
    return;
  }
  await writeHistoryRow(ownerId, id, {
    hand: historyHand(record, id, "hero"), record, status: "pending", error: null,
    attempts: 0, retryAtMs: 0,
  });
}

export async function acceptHistoryHand(ownerId: string, hand: HistoryHand): Promise<void> {
  await writeHistoryRow(ownerId, localHistoryId(hand), {
    hand, record: null, status: "synced", error: null, attempts: 0, retryAtMs: 0,
  });
}

export async function historyRetry(ownerId: string, id: string, error: string, permanent: boolean, attempts: number): Promise<void> {
  const row = await readHistoryRow(ownerId, id);
  if (!row || row.status === "synced") return;
  await writeHistoryRow(ownerId, id, {
    ...row, status: permanent ? "rejected" : "pending", error, attempts,
    retryAtMs: Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8)),
  });
}

export const historyRow = readHistoryRow;
export const pendingHistory = readPendingRows;
export const historySessions = readSessionPage;
export const sessionHands = readHandPage;
export const historyCursor = readHistoryCursor;
export const setHistoryCursor = writeHistoryCursor;
