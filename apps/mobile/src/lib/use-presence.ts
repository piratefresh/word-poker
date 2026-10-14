/**
 * use-presence.ts — tells the server this account's app is open, and picks up table invites (STO-584).
 *
 * Presence is a heartbeat, not a socket: the API runs as several instances, so "online" is a row
 * that goes stale 45s after the last beat. The beat's reply carries any invites, so one request
 * covers both. Guests have no friends and do not beat.
 */

import type { TableInvite } from "@wordpoker/contracts";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { useActiveRoomId } from "@/features/online/room-session";
import { beat, goOffline } from "@/lib/friends-client";

export const HEARTBEAT_MS = 20_000;

export function usePresence(account: boolean): { invite: TableInvite | null; dismiss: () => void } {
  const atTable = useActiveRoomId() !== null;
  const [invite, setInvite] = useState<TableInvite | null>(null);

  useEffect(() => {
    if (!account) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      void beat(atTable)
        .then((invites) => {
          const latest = invites.at(-1);
          if (latest) setInvite(latest);
        })
        .catch(() => {});
    };
    const start = () => {
      if (timer !== undefined) return;
      tick();
      timer = setInterval(tick, HEARTBEAT_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      void goOffline().catch(() => {});
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => (state === "active" ? start() : stop()));
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [account, atTable]);

  return { invite: account ? invite : null, dismiss: () => setInvite(null) };
}
