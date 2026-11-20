import type { FriendsPage } from "@wordpoker/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { getFriends } from "@/lib/friends/friends-client";

/** How often an open friends list re-reads, so a friend's status follows the heartbeat. */
const REFRESH_MS = 15_000;

const UNREACHABLE = "Friends couldn't be reached.";

/**
 * The friends page while the screen has focus: read on focus, re-read every REFRESH_MS, and once
 * more after each action. A newer read or action discards an older one's reply (`generation`).
 */
export function useFriendsPage(anonymous: boolean) {
  const [page, setPage] = useState<FriendsPage | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const generation = useRef(0);

  const load = useCallback(() => {
    const current = ++generation.current;
    return getFriends().then((data) => {
      if (generation.current !== current) return;
      setPage(data);
      setMessage("");
    }).catch((error: unknown) => {
      if (generation.current === current) setMessage(error instanceof Error ? error.message : UNREACHABLE);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!anonymous) {
      void load();
      timer = setInterval(() => { void load(); }, REFRESH_MS);
    }
    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [anonymous, load]));

  const act = async (action: () => Promise<string | void>) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    const current = ++generation.current;
    try {
      const result = await action();
      if (current !== generation.current) return;
      setMessage(result ?? "Friends updated.");
      const data = await getFriends();
      if (current === generation.current) setPage(data);
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : UNREACHABLE);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  };

  return { page, message, setMessage, busy, act, refresh: () => act(async () => {}) };
}
