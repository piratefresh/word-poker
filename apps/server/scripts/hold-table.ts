/**
 * Hold a seat at a table, for the E2E flows that read a table off the lobby.
 *
 * `.maestro/online-lobby.yaml` and `.maestro/lobby-coins.yaml` drive a single browser, and one
 * client cannot both sit at a table and list it as open — the row they need to see is a table
 * somebody else has a seat in. This script is that somebody else: it signs in as `e2e-2` (a table
 * seats an account once, and the flows sign in as `e2e@` or a Wallet persona), creates a table with
 * the config the flows expect, and keeps the seat until it is stopped (`Ctrl-C`), so the lobby
 * the flows read has a real, joinable table in it. Stopping it (or letting it die) frees the seat,
 * which the lobby shows live.
 *
 * Usage, from the repo root (the Colyseus server and the Expo API have to be running):
 *   pnpm --filter @wordpoker/server exec tsx scripts/hold-table.ts
 *
 * Override with TABLE_NAME / BUY_IN / MAX_SEATS / GAME_URL / HOLDER_EMAIL. The name is what the
 * flows assert on, so a different one means pointing the flows at it too.
 */

import { Client } from "@colyseus/sdk";

import { authenticateSmokeClient } from "./authenticate.js";

const NAME = process.env.TABLE_NAME ?? "Node Table";
const BUY_IN = Number(process.env.BUY_IN ?? 500);
const MAX_SEATS = Number(process.env.MAX_SEATS ?? 2);
const GAME_URL = process.env.GAME_URL ?? "ws://localhost:2567";

const client = new Client(GAME_URL);
await authenticateSmokeClient(client, process.env.HOLDER_EMAIL ?? "e2e-2@wordpoker.dev");
const room = await client.create("game", { name: NAME, buyIn: BUY_IN, maxSeats: MAX_SEATS });

console.log(`holding "${NAME}" (${BUY_IN} coins, ${MAX_SEATS} seats) — table ${room.roomId} as ${room.sessionId}`);
console.log("Ctrl-C to give the seat up.");

setInterval(() => {}, 60_000);
