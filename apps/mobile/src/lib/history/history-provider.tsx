import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { HandRecord } from "@wordpoker/contracts";
import { authClient } from "@/auth/client/auth-client";
import { captureHistoryHand, pendingSessionCount } from "./history-store";
import { syncHistory } from "./history-sync";

interface HistoryValue {
  ownerId: string | null;
  /** Bumps when saved hands change; paged views reload their loaded rows. */
  revision: number;
  syncing: boolean;
  offline: boolean;
  lastSyncedAt: number | null;
  uploadingSessionId: string | null;
  pendingSessions: number;
  error: string | null;
  capture: (record: HandRecord) => Promise<void>;
  refresh: () => void;
}
const HistoryContext = createContext<HistoryValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const ownerId = session?.user.id ?? null;
  return <AccountHistory key={ownerId ?? "signed-out"} ownerId={ownerId}>{children}</AccountHistory>;
}

function AccountHistory({ ownerId, children }: { ownerId: string | null; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const network = Network.useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [uploadingSessionId, setUploadingSessionId] = useState<string | null>(null);
  const [pendingSessions, setPendingSessions] = useState(0);
  const refreshing = useRef(false);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const refresh = useCallback(() => {
    if (!ownerId || offline || refreshing.current) return;
    refreshing.current = true;
    setSyncing(true);
    void syncHistory(ownerId, changed, setUploadingSessionId).then(() => { setError(null); setLastSyncedAt(Date.now()); }, (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Waiting for connection.");
    }).finally(() => { refreshing.current = false; setSyncing(false); changed(); });
  }, [changed, ownerId, offline]);

  useEffect(() => {
    let active = true;
    if (ownerId) void pendingSessionCount(ownerId).then((count) => {
      if (active) setPendingSessions(count);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [ownerId, revision]);

  useEffect(() => {
    let active = true;
    void Network.getNetworkStateAsync().then((state) => { if (active && state.isConnected) refresh(); }).catch(() => undefined);
    const app = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    const network = Network.addNetworkStateListener((state) => { if (state.isConnected) refresh(); });
    // Bounded, persisted retries also run while the app remains in the foreground.
    const timer = setInterval(() => { if (AppState.currentState === "active") refresh(); }, 30_000);
    return () => { active = false; app.remove(); network.remove(); clearInterval(timer); };
  }, [refresh]);

  const capture = useCallback(async (record: HandRecord) => {
    if (!ownerId) throw new Error("Sign in before starting a hand to save its history.");
    await captureHistoryHand(ownerId, record);
    changed();
    refresh();
  }, [changed, ownerId, refresh]);
  const value = useMemo(() => ({ ownerId, revision, syncing, offline, lastSyncedAt, uploadingSessionId, pendingSessions, error, capture, refresh }),
    [ownerId, revision, syncing, offline, lastSyncedAt, uploadingSessionId, pendingSessions, error, capture, refresh]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error("HistoryProvider is missing.");
  return value;
}
