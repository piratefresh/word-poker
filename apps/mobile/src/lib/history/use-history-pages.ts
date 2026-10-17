import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "./history-provider";
import { historyRow, historySessions, localHistoryId, sessionHands, type HandCursor, type HistorySession, type LocalHistoryHand, type SessionCursor } from "./history-store";

const PAGE = 20;
type Load<T, C> = (after: C | null, limit: number) => Promise<T[]>;
interface Paged<T> { items: readonly T[]; loading: boolean; loadMore: () => void }
const NONE: readonly never[] = [];

/**
 * Keyset-paged rows for a list. `load` is null while there is nothing to read; a new `load` starts a
 * fresh list, and a revision bump re-reads as many rows as are already loaded so the list never shrinks.
 */
function usePaged<T, C>(load: Load<T, C> | null, cursorOf: (item: T) => C, revision: number): Paged<T> {
  const [state, setState] = useState<{ load: Load<T, C> | null; items: readonly T[]; hasMore: boolean }>({ load: null, items: NONE, hasMore: false });
  const generation = useRef(0);
  const loadingMore = useRef(false);
  const loaded = useRef(0);
  const lastLoad = useRef(load);

  useEffect(() => {
    const mine = ++generation.current;
    loadingMore.current = false;
    if (lastLoad.current !== load) { lastLoad.current = load; loaded.current = 0; }
    if (!load) return;
    const limit = Math.max(PAGE, loaded.current);
    load(null, limit).then((items) => {
      if (mine !== generation.current) return;
      loaded.current = items.length;
      setState({ load, items, hasMore: items.length === limit });
    }, () => undefined);
  }, [load, revision]);

  const current = state.load === load ? state : null;
  const loadMore = useCallback(() => {
    if (!load || !current?.hasMore || loadingMore.current) return;
    const last = current.items[current.items.length - 1];
    if (!last) return;
    loadingMore.current = true;
    const mine = generation.current;
    load(cursorOf(last), PAGE).then((next) => {
      if (mine !== generation.current) return;
      loaded.current += next.length;
      setState((previous) => previous.load === load ? { load, items: [...previous.items, ...next], hasMore: next.length === PAGE } : previous);
    }, () => undefined).finally(() => { loadingMore.current = false; });
  }, [load, current, cursorOf]);

  return { items: load ? current?.items ?? NONE : NONE, loading: load !== null && current === null, loadMore };
}

const sessionCursor = (session: HistorySession): SessionCursor => ({ endedAtMs: session.endedAtMs, sessionId: session.sessionId });
const handCursor = (row: LocalHistoryHand): HandCursor => ({ endedAtMs: row.hand.endedAtMs, id: localHistoryId(row.hand) });

export function useHistorySessions(): Paged<HistorySession> {
  const { ownerId, revision } = useHistory();
  const load = useCallback<Load<HistorySession, SessionCursor>>((after, limit) => historySessions(ownerId ?? "", after, limit), [ownerId]);
  return usePaged(ownerId ? load : null, sessionCursor, revision);
}

export function useSessionHands(sessionId: string | undefined): Paged<LocalHistoryHand> {
  const { ownerId, revision } = useHistory();
  const load = useCallback<Load<LocalHistoryHand, HandCursor>>((after, limit) => sessionHands(ownerId ?? "", sessionId ?? "", after, limit), [ownerId, sessionId]);
  return usePaged(ownerId && sessionId ? load : null, handCursor, revision);
}

/** One saved hand by its local id (`sessionId:handNo`). */
export function useHistoryHand(handId: string | undefined): { row: LocalHistoryHand | null; loading: boolean } {
  const { ownerId, revision } = useHistory();
  const [found, setFound] = useState<{ key: string; row: LocalHistoryHand | null } | null>(null);
  const key = ownerId && handId ? `${ownerId}/${handId}` : null;
  useEffect(() => {
    if (!ownerId || !handId) return;
    let active = true;
    historyRow(ownerId, handId).then((row) => { if (active) setFound({ key: `${ownerId}/${handId}`, row }); }, () => undefined);
    return () => { active = false; };
  }, [ownerId, handId, revision]);
  const current = key !== null && found?.key === key ? found : null;
  return { row: current?.row ?? null, loading: key !== null && current === null };
}
