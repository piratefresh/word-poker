/**
 * Hold a seat at a table, for the E2E flow that joins one from the lobby.
 *
 * `.maestro/online-lobby.yaml` drives a single browser, and one client cannot both sit at a table
 * and list it as open — the row it needs to see is a table somebody else has a seat in. This
 * script is that somebody else: it creates a table with the config the flow expects and keeps the
 * seat until it is stopped (`Ctrl-C`), so the lobby the flow reads has a real, joinable table in
 * it. Stopping it (or letting it die) frees the seat, which the lobby shows live.
 *
 * Usage (from the repo root; the Colyseus server has to be running):
 *   node scripts/hold-table.mjs
 *
 * Override with TABLE_NAME / BUY_IN / MAX_SEATS / GAME_URL. The name is what the flow asserts on,
 * so a different one means pointing the flow at it too.
 */

import { Client } from "@colyseus/sdk";

const NAME = process.env.TABLE_NAME ?? "Node Table";
const BUY_IN = Number(process.env.BUY_IN ?? 500);
const MAX_SEATS = Number(process.env.MAX_SEATS ?? 2);
const GAME_URL = process.env.GAME_URL ?? "ws://localhost:2567";

const client = new Client(GAME_URL);
const room = await client.create("game", { name: NAME, buyIn: BUY_IN, maxSeats: MAX_SEATS });

console.log(`holding "${NAME}" ($${BUY_IN}, ${MAX_SEATS} seats) — table ${room.roomId} as ${room.sessionId}`);
console.log("Ctrl-C to give the seat up.");

setInterval(() => {}, 60_000);
