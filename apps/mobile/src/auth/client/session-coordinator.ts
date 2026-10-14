/**
 * session-coordinator.ts — the one road a session change on this device takes (STO-593).
 *
 * A guest tap, an invite link's guest, an email sign-in, a sign-out and (STO-591/592) a platform
 * restore each answer with a Set-Cookie. Two in flight and the later answer wins, whichever the
 * player meant — so they run one at a time here. A request that throws (dropped connection,
 * timeout) has an unknown outcome: the session is re-read from the server before the next starts.
 *
 * Choosing guest play or signing out also turns automatic platform restore off until the player
 * deliberately signs in again; the platform tickets check `autoRestoreAllowed` before restoring.
 */

import * as SecureStore from "expo-secure-store";

import { leaveTable } from "@/features/online/room-session";

import { authClient } from "./auth-client";

let tail: Promise<unknown> = Promise.resolve();

export function changeSession<T>(change: () => Promise<T>): Promise<T> {
  const run = async () => {
    // A seat belongs to the account that took it: give it up before becoming someone else.
    await leaveTable().catch(() => {});
    try {
      return await change();
    } catch (error) {
      authClient.$store.notify("$sessionSignal");
      throw error;
    }
  };
  const next = tail.then(run, run);
  tail = next.catch(() => {});
  return next;
}

const RESTORE_KEY = "wordpoker.platformRestore";

/**
 * Persisted before the sign-out or guest choice it belongs to, so a relaunch or a foreground
 * cannot sneak a restore in between. Web has no platform restore (nor SecureStore): a no-op there.
 */
export async function setAutoRestore(allowed: boolean): Promise<void> {
  await (allowed ? SecureStore.deleteItemAsync(RESTORE_KEY) : SecureStore.setItemAsync(RESTORE_KEY, "off")).catch(() => {});
}

export async function autoRestoreAllowed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(RESTORE_KEY).catch(() => null)) !== "off";
}
