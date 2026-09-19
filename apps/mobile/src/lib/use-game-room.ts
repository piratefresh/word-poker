import type { Room } from "@colyseus/sdk";
import { useEffect, useRef, useState } from "react";

import { GAME_ROOM, gameClient, gameServerURL } from "./game-client";

/** A flat read of the room's synced state — enough to prove the pipe end to end. */
export interface GameRoomSnapshot {
  phase: string;
  roundDeadline: number;
  handCount: number;
  playerCount: number;
}

export type ConnectionStatus = "connecting" | "joined" | "left" | "error";

export interface GameRoomView {
  status: ConnectionStatus;
  roomId?: string;
  sessionId?: string;
  error?: string;
  snapshot?: GameRoomSnapshot;
}

/**
 * Joins the game room on mount, logs every state change, and exposes the latest
 * snapshot. This is the minimal connect-and-observe slice — it does not yet drive the
 * game screen. It leaves the room on unmount so a screen can mount it freely.
 */
export function useGameRoom(): GameRoomView {
  const [view, setView] = useState<GameRoomView>({ status: "connecting" });
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    // Effects can outlive the async join; `cancelled` keeps a late resolve from touching
    // state (and leaves the room it opened after we already tore down).
    let cancelled = false;
    console.log(`[game-room] joining "${GAME_ROOM}" at ${gameServerURL}`);

    gameClient
      .joinOrCreate(GAME_ROOM)
      .then((room) => {
        if (cancelled) {
          room.leave();
          return;
        }
        roomRef.current = room;
        console.log(`[game-room] joined ${room.roomId} as ${room.sessionId}`);
        setView({ status: "joined", roomId: room.roomId, sessionId: room.sessionId });

        room.onStateChange((state) => {
          const snapshot: GameRoomSnapshot = {
            phase: state.phase,
            roundDeadline: state.roundDeadline,
            handCount: state.handCount,
            playerCount: state.players.size,
          };
          console.log("[game-room] state", snapshot);
          setView((prev) => ({ ...prev, snapshot }));
        });

        room.onError((code, message) => {
          console.warn("[game-room] error", code, message);
          setView((prev) => ({ ...prev, status: "error", error: message }));
        });

        room.onLeave((code) => {
          console.log("[game-room] left", code);
          setView((prev) => ({ ...prev, status: "left" }));
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[game-room] join failed", message);
        setView({ status: "error", error: message });
      });

    return () => {
      cancelled = true;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  return view;
}
