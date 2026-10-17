import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { HandRecord } from "@wordpoker/contracts";
import { authClient } from "@/auth/client/auth-client";
import { captureHistoryHand } from "./history-store";
import { syncHistory } from "./history-sync";

interface HistoryValue {
  ownerId: string | null;
  /** Bumps when saved hands change; paged views reload their loaded rows. */
  revision: number;
  syncing: boolean;
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
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const refresh = useCallback(() => {
    if (!ownerId) return;
    setSyncing(true);
    void syncHistory(ownerId, changed).then(() => setError(null), (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Waiting for connection.");
    }).finally(() => { setSyncing(false); changed(); });
  }, [changed, ownerId]);

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
  const value = useMemo(() => ({ ownerId, revision, syncing, error, capture, refresh }),
    [ownerId, revision, syncing, error, capture, refresh]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error("HistoryProvider is missing.");
  return value;
}
