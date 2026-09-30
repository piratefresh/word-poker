/**
 * The four-browser smoke's eyes on the lobby (STO-483): a lobby subscriber that takes no seat.
 *
 * `scripts/smoke-online-four.ps1` launches the four browsers one at a time, and needs to know
 * when each has sat down so the next one joins after it — join order is seat order, and each
 * seat's flow spells the rack its seat is dealt. It reads that off this script's output: one line
 * per listing change,
 *
 *   table <roomId> "<table name>" clients=<n>
 *
 * Usage, from the repo root (GAME_URL defaults to the local server):
 *
 *   pnpm --filter @wordpoker/server exec tsx scripts/smoke-lobby-watch.ts
 */

import { Client } from "@colyseus/sdk";

import { LOBBY_ROOM_NAME } from "@wordpoker/contracts";

const GAME_URL = process.env.GAME_URL ?? "ws://localhost:2567";

interface Listing {
  roomId: string;
  clients: number;
  metadata?: { name?: unknown };
}

function print(listing: Listing) {
  const name = typeof listing.metadata?.name === "string" ? listing.metadata.name : "";
  console.log(`table ${listing.roomId} "${name}" clients=${listing.clients}`);
}

const lobby = await new Client(GAME_URL).joinOrCreate(LOBBY_ROOM_NAME);
lobby.onMessage("rooms", (listings: Listing[]) => listings.forEach(print));
lobby.onMessage("+", ([, listing]: [string, Listing]) => print(listing));
lobby.onMessage("-", (roomId: string) => console.log(`gone ${roomId}`));
lobby.send("filter");
console.log(`watching the lobby at ${GAME_URL}`);
