/** Real local Expo + Colyseus auth check; creates only its own sessions and temporary table. */
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import { authenticateSmokeClient } from "./authenticate.js";
import { onlineAccount } from "../src/auth/online-account.js";

const apiOrigin = process.env.AUTH_API_URL ?? "http://localhost:8081";
const gameUrl = process.env.GAME_URL ?? "ws://localhost:2567";
const client = new Client(gameUrl);
const anonymous = new Client(gameUrl);
const rooms: Room[] = [];
const table = { name: "Local auth check", buyIn: 500, maxSeats: 2, powerUps: { deal: "off" } };

async function rejectsJoin(candidate: Client): Promise<void> {
  await assert.rejects(async () => {
    const unexpected = await candidate.create("game", table);
    await unexpected.leave();
  }, (error: { code?: number }) => error.code === 401);
}

try {
  // Metro compiles this route on first use; do that before the room's five-second auth budget.
  const warmup = await fetch(new URL("/api/auth/get-session", apiOrigin), { signal: AbortSignal.timeout(30000) });
  assert.equal(warmup.status, 200);
  await rejectsJoin(anonymous);
  console.log("PASS: anonymous table creation rejected");
  anonymous.auth.token = "forged-session-token";
  await rejectsJoin(anonymous);
  console.log("PASS: forged credentials rejected");

  await authenticateSmokeClient(client);
  const account = await onlineAccount(client.auth.token);
  assert.ok(account.userId);
  console.log("PASS: real local Better Auth sign-in verified");
  const created = await client.create("game", { ...table, userId: "forged-account-id" });
  rooms.push(created);
  created.onMessage("*", () => {});
  console.log("PASS: authenticated table creation");
  await assert.rejects(async () => {
    const duplicate = await client.joinById(created.roomId, { userId: "another-forged-account-id" });
    rooms.push(duplicate);
  }, (error: { code?: number }) => error.code === 409);
  console.log("PASS: one account cannot take a second seat");

  const signOut = await fetch(new URL("/api/auth/sign-out", apiOrigin), {
    method: "POST",
    headers: { authorization: `Bearer ${client.auth.token}`, origin: new URL(apiOrigin).origin, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(signOut.status, 200);
  await rejectsJoin(client);
  console.log("PASS: revoked session cannot take a new seat");
} finally {
  await Promise.all(rooms.map((room) => room.leave()));
  if (client.auth.token) {
    await fetch(new URL("/api/auth/sign-out", apiOrigin), {
      method: "POST",
      headers: { authorization: `Bearer ${client.auth.token}`, origin: new URL(apiOrigin).origin, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
}
