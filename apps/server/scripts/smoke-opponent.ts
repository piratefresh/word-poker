/**
 * The other player for the multiplayer web smoke (`.maestro/online-hand.yaml`, STO-409).
 *
 * A hand needs two seats and a browser is one, so this script is the second: it creates a seeded
 * two-seat table, says ready, and plays whatever the browser leaves it — a check when nothing is
 * owed, a call when something is — and at §19's window confirms the best word its rack and the
 * board spell, found by the same search the offline bots use. It plays the one hand, and waits for
 * the next deal so the table stays up while the flow reads the result; stop it with Ctrl-C.
 *
 * The seed only pins the deal when the server honors it, so the Colyseus server has to run with
 * WORDPOKER_DETERMINISTIC_SEED=1 (see the flow's header). Usage, from the repo root:
 *
 *   pnpm --filter @wordpoker/server exec tsx scripts/smoke-opponent.ts
 *
 * Override with TABLE_NAME / SEED / GAME_URL / BEAT_MS. The name and seed are what the flow
 * asserts on and spells from, so a different one means pointing the flow at it too.
 */

import { Client } from "@colyseus/sdk";

import { GAME_EVENTS, GAME_MESSAGES, type PrivateSeatState, type Tile } from "@wordpoker/contracts";
import { chooseOfflineWord, loadDictionary } from "@wordpoker/game-rules";

const NAME = process.env.TABLE_NAME ?? "Smoke Table";
const SEED = Number(process.env.SEED ?? 409);
const GAME_URL = process.env.GAME_URL ?? "ws://localhost:2567";
/** A human-readable pause before each of this seat's actions, so a headed run can be watched. */
const BEAT_MS = Number(process.env.BEAT_MS ?? 700);
/** Keeps HAND #1 results on screen for the browser flow to assert. */
const PAYOUT_DELAY_MS = 60_000;

type Seat = { seat: number; playerId: string; committedThisRound: number; ready: boolean };
type State = {
  phase: string;
  toActSeat: number;
  handCount: number;
  seats: Map<string, Seat>;
  community: Iterable<{ toJSON(): unknown }>;
  betting: { currentBet: number };
  wordWindow: { status: string };
};

const dictionary = await loadDictionary();
const client = new Client(GAME_URL);
const room = await client.create("game", {
  name: NAME,
  buyIn: 500,
  maxSeats: 2,
  seed: SEED,
  payoutDelay: PAYOUT_DELAY_MS,
});
console.log(`seated at "${NAME}" (seed ${SEED}) — table ${room.roomId} as ${room.sessionId}`);

let rack: PrivateSeatState | null = null;
room.onMessage(GAME_EVENTS.privateState, (payload: PrivateSeatState) => {
  rack = payload;
  decide();
});
room.onMessage(GAME_EVENTS.rejected, (payload) => console.log("rejected:", payload));

let busy = false;
let confirmedHand = 0;
/** The spot this seat last acted on — hand, street and the bet it faced — so no spot is played twice. */
let actedOn = "";
room.onStateChange(() => decide());

function decide() {
  const state = room.state as unknown as State;
  const me = state.seats.get(room.sessionId);
  if (!me || busy) return;

  // Ready whenever somebody sits across from us and our seat is not: the waiting room deals when
  // every seat has said so, and a seat that comes and goes clears what the table had said.
  if (state.phase === "waiting" && state.seats.size === 2 && !me.ready) {
    later(() => room.send(GAME_MESSAGES.ready, { ready: true }), "ready");
    return;
  }

  const seatRack = rack;
  if (state.wordWindow.status === "open") {
    if (confirmedHand === state.handCount || seatRack?.hand !== state.handCount) return;
    confirmedHand = state.handCount;
    const board = [...state.community].map((tile) => tile.toJSON() as Tile);
    const submission = chooseOfflineWord({ available: [...seatRack.rack, ...board], dictionary });
    later(() => room.send(GAME_MESSAGES.confirmWord, { submission: submission ?? { plays: [] } }), "word");
    return;
  }

  const spot = `${state.handCount}:${state.phase}:${state.betting.currentBet}`;
  if (state.toActSeat === me.seat && spot !== actedOn) {
    actedOn = spot;
    const owes = state.betting.currentBet > me.committedThisRound;
    later(() => room.send(GAME_MESSAGES.betting, { type: owes ? "call" : "check" }), owes ? "call" : "check");
  }
}

/** One action after the beat, then a fresh look: a change that landed during the beat is not lost. */
function later(send: () => void, what: string) {
  busy = true;
  setTimeout(() => {
    busy = false;
    console.log(what);
    send();
    decide();
  }, BEAT_MS);
}

room.onLeave(() => process.exit(0));
