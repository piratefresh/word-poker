import { schema, t, type SchemaType } from "@colyseus/schema";
import { WAITING_PHASE } from "@wordpoker/contracts";

export const Player = schema({
  score: t.uint16().default(0),
});
export type Player = SchemaType<typeof Player>;

export const GameRoomState = schema({

  players: t.map(Player),

  /** Current betting round; `WAITING_PHASE` until enough players have joined to start. */
  phase: t.string().default(WAITING_PHASE),

  /** Room-clock time (ms) the current round ends at; 0 whenever nothing is counting down. */
  roundDeadline: t.number().default(0),

  /** Hands dealt so far; 0 before the first round begins. */
  handCount: t.uint16().default(0),

});
export type GameRoomState = SchemaType<typeof GameRoomState>;
