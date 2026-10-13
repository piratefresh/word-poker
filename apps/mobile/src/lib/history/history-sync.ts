import { isHistoryHand, isHistoryPage, type HistoryPage, type HandRecord } from "@wordpoker/contracts";
import { authClient } from "@/auth/client/auth-client";
import { apiBaseURL } from "@/lib/api-base-url";
import { acceptHistoryHand, historyCursor, historyRetry, localHistory, localHistoryId, setHistoryCursor } from "./history-store";

async function request(ownerId: string, path: string, record?: HandRecord): Promise<Response> {
  // Refresh auth before each request. An account switch never sends another account's outbox.
  const session = await authClient.getSession({ query: { disableCookieCache: true } });
  if (session.error || session.data?.user.id !== ownerId || !session.data.session.token) {
    throw new Error("Sign in to this account to sync its hands.");
  }
  // Bind the response to this verified account even if the browser cookie switches while
  // the request is in flight. Otherwise another account's history could enter this partition.
  const headers = { authorization: `Bearer ${session.data.session.token}` };
  return fetch(`${apiBaseURL}/api/history/hands${path}`, {
    credentials: "omit", headers, signal: AbortSignal.timeout(20_000),
    ...(record ? {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(record),
    } : {}),
  });
}

const running = new Map<string, Promise<void>>();
export function syncHistory(ownerId: string, changed: () => void): Promise<void> {
  const current = running.get(ownerId);
  if (current) return current;
  const sync = run(ownerId, changed).finally(() => running.delete(ownerId));
  running.set(ownerId, sync);
  return sync;
}

async function run(ownerId: string, changed: () => void): Promise<void> {
  for (const row of await localHistory(ownerId)) {
    if (row.status !== "pending" || !row.record || row.retryAtMs > Date.now()) continue;
    try {
      const response = await request(ownerId, "", row.record);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = typeof body === "object" && body && "error" in body ? String(body.error) : "Hand upload failed.";
        await historyRetry(ownerId, localHistoryId(row.hand), error, [400, 409, 413, 422].includes(response.status), row.attempts + 1);
        changed();
        if (response.status === 401 || response.status >= 500) throw new Error(error);
        continue;
      }
      if (!isHistoryHand(body)) throw new Error("The saved hand could not be read.");
      await acceptHistoryHand(ownerId, body);
      changed();
    } catch (error) {
      await historyRetry(ownerId, localHistoryId(row.hand), error instanceof Error ? error.message : "Waiting for connection.", false, row.attempts + 1);
      changed();
      throw error;
    }
  }
  let cursor = await historyCursor(ownerId);
  let page: HistoryPage;
  do {
    const response = await request(ownerId, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
    if (!response.ok) throw new Error("Waiting for connection. Saved hands remain available.");
    const body: unknown = await response.json();
    if (!isHistoryPage(body)) throw new Error("History could not be read.");
    page = body;
    if (page.hasMore && page.cursor === cursor) throw new Error("History cursor did not advance.");
    for (const hand of page.hands) await acceptHistoryHand(ownerId, hand);
    // Advance only after every row is durable: a crash re-fetches safely.
    await setHistoryCursor(ownerId, page.cursor);
    cursor = page.cursor;
    changed();
  } while (page.hasMore);
}
