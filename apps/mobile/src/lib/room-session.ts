/**
 * room-session.ts — the one table this device is sitting at.
 *
 * The lobby lists tables; this module is what happens after a tap: create one with a config,
 * join one by id, and hold the resulting room while a seat is held. It is one seat per device by
 * construction — a room counts connections, not identities, so a second join would take a second
 * seat rather than return to the first. The lobby's "you are already here" row, the seated screen
 * and a room deep link all read the same session through this module instead of opening their own.
 *
 * Joining is always by id (`joinById`): `joinOrCreate` would seat the player at an arbitrary
 * joinable table or auto-create a default-config one, neither of which is the table they tapped.
 *
 * The state read here is a mirror: the server owns the table, and this is its projection — name,
 * stakes and live seat count, straight off the synced schema (the schema classes themselves stay
 * in `apps/server`, per AGENTS.md).
 */

import type { Room } from "@colyseus/sdk";
import { GameRoomCreateOptions, GAME_ROOM_NAME, RoomPhase } from "@wordpoker/contracts";
import { useSyncExternalStore } from "react";

import { gameClient } from "./game-client";

/** Colyseus's matchmaking codes, as named by its own error enum. */
const MATCHMAKE_NO_HANDLER = 520;
const MATCHMAKE_INVALID_CRITERIA = 521;
const MATCHMAKE_INVALID_ROOM_ID = 522;
const MATCHMAKE_EXPIRED = 524;

/** The table as the synced state mirrors it — enough to seat a screen, nothing more. */
export interface TableSnapshot {
  readonly name: string;
  readonly buyIn: number;
  readonly minBet: number;
  readonly maxSeats: number;
  /** Seats taken right now. A seat is a connection, so this is live. */
  readonly seats: number;
  readonly phase: RoomPhase;
}

export type RoomSessionStatus =
  /** No seat: the table was never taken, or has been left. */
  | "idle"
  /** A create or join is in flight. */
  | "joining"
  /** Seated at `roomId`; `table` is live. */
  | "seated"
  /** The seat went away on its own — the server dropped us or the room disposed. */
  | "lost"
  /** Taking the seat failed; `roomId` says which table, `error` says why. */
  | "error";

export interface RoomSessionView {
  readonly status: RoomSessionStatus;
  /** The table this session is about: named while joining or seated, or after a failed join. */
  readonly roomId?: string;
  readonly table?: TableSnapshot;
  /** A sentence for the player, not a stack trace. */
  readonly error?: string;
}

/** The slice of the room's synced state the session reads. The schema lives on the server. */
interface TableState {
  name: string;
  buyIn: number;
  minBet: number;
  maxSeats: number;
  phase: RoomPhase;
  players: { size: number };
}

let view: RoomSessionView = { status: "idle" };
let held: Room | null = null;
const listeners = new Set<() => void>();

/**
 * The seat request that has not landed yet, and the number it was given. The device holds one
 * seat at a time, so the request in the air is state of its own rather than something read back
 * out of `view` — which is a projection published a microtask after the request that caused it,
 * and would leave a window a second ask could slip through. A request the device has moved on
 * from gives its seat straight back on arrival.
 */
let inFlight: { readonly roomId: string | null; readonly attempt: number } | null = null;
let attempt = 0;

/** Record a seat request as the one that owns the seat from here on. */
function claim(roomId: string | null): number {
  const taken = ++attempt;
  inFlight = { roomId, attempt: taken };
  return taken;
}

function publish(next: RoomSessionView) {
  view = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `onStateChange` hands us the decoded schema; the cast is where the wire meets the table. */
function tableOf(state: unknown): TableSnapshot {
  const table = state as TableState;
  return {
    name: table.name,
    buyIn: table.buyIn,
    minBet: table.minBet,
    maxSeats: table.maxSeats,
    seats: table.players.size,
    phase: table.phase,
  };
}

/**
 * Turn a matchmaking refusal into something a player can act on. Everything the lobby can hit is
 * a room that closed under it: a table that filled up locks itself, and a locked or disposed room
 * answers `joinById` with the same "invalid room id" the matchmaker uses for a room that never was.
 */
function joinFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === MATCHMAKE_INVALID_ROOM_ID) return "That table is full or has just closed.";
  if (code === MATCHMAKE_NO_HANDLER || code === MATCHMAKE_INVALID_CRITERIA) {
    return "That table isn't available. Try the list again.";
  }
  if (code === MATCHMAKE_EXPIRED) return "That table stopped waiting. Try again.";
  return "Couldn't reach that table.";
}

/** A create's refusal is our own validator's sentence, so the server's words are the ones shown. */
function createFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : undefined;
  return message && message.length > 0 ? message : "Couldn't create that table.";
}

/** Wire the room's own events to the session, so a dropped seat leaves the UI honestly. */
function hold(room: Room, taken: number) {
  if (taken !== attempt) {
    // The device asked for something else while this seat was in the air — another table, or a
    // leave. The seat is not this request's to keep, so it goes back rather than counting as a
    // player nobody is driving. `inFlight` already belongs to the newer request.
    void room.leave();
    return;
  }

  inFlight = null;
  held = room;
  // The room's state lands a round trip after the seat does, so this first publish carries no
  // table: a screen waits in its seated-but-empty state until the first patch names one.
  publish({ status: "seated", roomId: room.roomId });

  room.onStateChange((state) => {
    if (held !== room) return;
    publish({ status: "seated", roomId: room.roomId, table: tableOf(state) });
  });

  room.onLeave(() => {
    if (held !== room) return;
    held = null;
    publish({ status: "lost", roomId: room.roomId, error: "You're no longer at that table." });
  });

  room.onError((code, message) => {
    if (held !== room) return;
    console.warn("[room-session] room error", code, message);
  });
}

/**
 * Give up whatever seat is held, and the request in the air with it — synchronously, so the seat
 * and the request that owns it can never be observed half-given-up. Returns the room whose leave
 * still has to make its round trip; the caller decides whether to wait on it.
 */
function giveUp(): Room | null {
  const room = held;
  held = null;
  // A request still in the air belongs to a device that has moved on: it gives its seat back on
  // arrival (`hold`) rather than holding one this release meant to give up.
  attempt++;
  inFlight = null;
  publish({ status: "idle" });
  return room;
}

/** The live session, for a screen that renders the table it is sitting at. */
export function useRoomSession(): RoomSessionView {
  return useSyncExternalStore(
    subscribe,
    () => view,
    () => view,
  );
}

/**
 * The room a seat is held at, for the lobby's "already seated" row (rules §3) and for a screen
 * that joins only when it does not already hold the seat it was routed to.
 */
export function useActiveRoomId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (view.status === "seated" ? (view.roomId ?? null) : null),
    () => (view.status === "seated" ? (view.roomId ?? null) : null),
  );
}

/**
 * Create a table with the given config and sit down at it — Colyseus's `create` makes the room and
 * takes the seat in one call. Resolves with the new room's id, which is what a route needs to show
 * the table. A refusal from the server rejects with the sentence it refused with (§2's config).
 */
export async function createTable(options: GameRoomCreateOptions): Promise<string> {
  // The claim is taken in the same tick as the release: a request that arrives while this one is
  // in the air has to find it, and the leaving of the old room is a round trip of its own.
  const previous = giveUp();
  const taken = claim(null);
  publish({ status: "joining" });
  await previous?.leave();

  try {
    const room = await gameClient.create(GAME_ROOM_NAME, options);
    hold(room, taken);
    return room.roomId;
  } catch (error) {
    if (taken === attempt) inFlight = null;
    const message = createFailure(error);
    console.warn("[room-session] create failed", message);
    publish({ status: "error", error: message });
    throw new Error(message);
  }
}

/**
 * Sit down at an existing table. Idempotent: asking for the table already held, or for the one a
 * join is already in the air for, resolves without a second join. Any other refusal rejects with
 * a sentence the caller can show.
 */
export async function joinTable(roomId: string): Promise<void> {
  // A room counts connections, so a second ask for the same table would take a second seat rather
  // than the first one again (§3's one seat per device). The screen above either ask is showing
  // "taking your seat", so the second one has nothing to wait for.
  if (inFlight?.roomId === roomId) return;
  if (view.status === "seated" && view.roomId === roomId) return;

  // As in `createTable`: the seat is given up and the next request claimed in one tick, so a
  // second ask landing during the join finds the first one rather than a half-released seat.
  const previous = giveUp();
  const taken = claim(roomId);
  publish({ status: "joining", roomId });
  await previous?.leave();

  try {
    const room = await gameClient.joinById(roomId);
    hold(room, taken);
  } catch (error) {
    if (taken === attempt) inFlight = null;
    const message = joinFailure(error);
    console.warn("[room-session] join failed", roomId, message);
    publish({ status: "error", roomId, error: message });
    throw new Error(message);
  }
}

/** Leave the table and give up the seat; the room disposes itself once the last seat goes. */
export async function leaveTable(): Promise<void> {
  await giveUp()?.leave();
}
