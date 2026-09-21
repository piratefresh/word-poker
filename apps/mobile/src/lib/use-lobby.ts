/**
 * use-lobby.ts — the open tables, live.
 *
 * The subscription is Colyseus's own LobbyRoom: joining it pushes the current listings and then
 * every change — `+` for a table added or replaced, `-` for one gone — so the screen never polls
 * and a seat taken by someone else appears as it happens. Every listing is read through
 * `roomSummaryFromListing`, the one place a socket's word is trusted: a listing that is not a Word
 * Poker table we can describe is left out of the list rather than drawn half-broken.
 *
 * The subscription is per-mount, joined when the screen mounts and left when it unmounts, because
 * the lobby room counts the connections it is telling. A dropped subscription keeps the rows it
 * already delivered: a stale list beside an honest sentence beats an empty screen.
 */

import type { Room } from "@colyseus/sdk";
import { LOBBY_ROOM_NAME, roomSummaryFromListing, type RoomSummary } from "@wordpoker/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { gameClient } from "@/lib/game-client";

export type LobbyStatus =
  /** Nothing has arrived yet — not a lobby with no tables in it. */
  | "loading"
  /** The list is live. An empty list here is genuinely empty. */
  | "ready"
  /** The subscription is gone; the rows held are the last the server sent. */
  | "error";

export interface LobbyView {
  readonly status: LobbyStatus;
  readonly rooms: RoomSummary[];
  /** A sentence for the player, not a stack trace. */
  readonly error?: string;
  readonly refresh: () => void;
}

const DROPPED = "Lost the table list. Check your connection and try again.";
const UNREACHABLE = "Couldn't reach the lobby. Check your connection and try again.";

/**
 * The lobby as a screen reads it: the tables open right now, and the two things it can do about
 * them — ask the server for the list again, and re-subscribe after the subscription dropped.
 */
export function useLobby(): LobbyView {
  const [status, setStatus] = useState<LobbyStatus>("loading");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const subscription = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    const fail = (message: string) => {
      if (cancelled) return;
      subscription.current = null;
      setStatus("error");
      setError(message);
    };

    const list = (listings: unknown) => {
      if (cancelled || !Array.isArray(listings)) return;

      const rows: RoomSummary[] = [];
      for (const listing of listings) {
        const summary = roomSummaryFromListing(listing);
        if (summary !== undefined) rows.push(summary);
      }

      setRooms(rows);
      setStatus("ready");
      setError(undefined);
    };

    // `+` carries `[roomId, listing]`: the table was added, or its listing changed under us —
    // a seat taken, a hand started — so the row is replaced rather than duplicated.
    const upsert = (update: unknown) => {
      if (cancelled || !Array.isArray(update)) return;
      const summary = roomSummaryFromListing(update[1]);
      if (summary === undefined) return;
      setRooms((current) =>
        current.some((row) => row.roomId === summary.roomId)
          ? current.map((row) => (row.roomId === summary.roomId ? summary : row))
          : [...current, summary],
      );
    };

    const drop = (roomId: unknown) => {
      if (cancelled || typeof roomId !== "string") return;
      setRooms((current) => current.filter((row) => row.roomId !== roomId));
    };

    gameClient
      .joinOrCreate(LOBBY_ROOM_NAME)
      .then((joined) => {
        if (cancelled) {
          // The screen went away mid-join: give the subscription back, or the lobby keeps
          // telling a device that stopped listening.
          void joined.leave();
          return;
        }

        room = joined;
        subscription.current = joined;
        joined.onMessage("rooms", list);
        joined.onMessage("+", upsert);
        joined.onMessage("-", drop);
        joined.onLeave(() => fail(DROPPED));
        joined.onError(() => fail(DROPPED));
      })
      .catch(() => fail(UNREACHABLE));

    return () => {
      cancelled = true;
      subscription.current = null;
      void room?.leave();
    };
  }, [attempt]);

  const refresh = useCallback(() => {
    const room = subscription.current;
    if (room !== null) {
      // A bare `filter` is the server's own "no filter" path: it pushes the whole list back.
      // (A filter of `{}` would be read as "no room is named `game`" and list nothing.)
      room.send("filter");
      return;
    }
    // The subscription is gone, so the retry is a fresh one.
    setStatus("loading");
    setError(undefined);
    setAttempt((current) => current + 1);
  }, []);

  return { status, rooms, error, refresh };
}
