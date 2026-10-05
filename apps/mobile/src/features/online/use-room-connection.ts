/**
 * use-room-connection.ts — the hero's own line to the table, as a felt can show it.
 *
 * The Colyseus SDK reconnects on its own: a droppable close fires `onDrop` and the client starts
 * retrying against the server's reconnection hold (§29, STO-397), `onReconnect` fires when the
 * socket is back, and an exhausted retry falls through to `onLeave` — which `room-session` turns
 * into the seat's `lost` state. This hook is only the middle of that: it watches the two signals
 * and reports whether the hero is connected or reconnecting, so the felt can raise a non-blocking
 * banner over a live hand rather than freeze or dump the player out. The seat, the rack and the
 * draft all come back with the reconnect (STO-397); this only says the line went quiet.
 */

import { useEffect, useState } from "react";

/** The room signals this hook watches: the SDK's own drop and reconnect callbacks. */
export interface RoomConnectionLike {
  onDrop: ((cb: () => void) => unknown) & { remove: (cb: () => void) => void };
  onReconnect: ((cb: () => void) => unknown) & { remove: (cb: () => void) => void };
}

export type RoomConnection = "connected" | "reconnecting";

/**
 * Whether the hero's socket is live. Starts connected — the felt only mounts this once the seat
 * is held — and flips to `reconnecting` on a drop, back to `connected` when the SDK restores it.
 * A drop the SDK cannot recover ends as a left room, which the session reports as a lost seat
 * one level up, so this hook never has to model that end itself.
 */
export function useRoomConnection(room: RoomConnectionLike): RoomConnection {
  const [connection, setConnection] = useState<RoomConnection>("connected");

  useEffect(() => {
    const onDrop = () => setConnection("reconnecting");
    const onReconnect = () => setConnection("connected");

    room.onDrop(onDrop);
    room.onReconnect(onReconnect);

    return () => {
      room.onDrop.remove(onDrop);
      room.onReconnect.remove(onReconnect);
    };
  }, [room]);

  return connection;
}
