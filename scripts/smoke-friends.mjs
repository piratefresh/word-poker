/**
 * Two-account friends smoke: request → accept → presence → table invite → offline → remove,
 * driven through the real API routes (`/api/friends*`) as two seeded E2E users.
 *
 * The Maestro `friends` flow only loads one account's tray; this covers what needs a second
 * account. It talks HTTP with Better Auth bearer tokens, so it needs a running API (Expo web,
 * started with EXPO_PUBLIC_LOCAL_API=1 for local routes) and the seeded users
 * (`pnpm seed:test-users`). It starts and ends with the pair unfriended, so reruns are safe.
 *
 * Usage, from the repo root:
 *   pnpm smoke:friends
 *
 * Override with AUTH_API_URL (default http://localhost:8081), FRIEND_A_EMAIL / FRIEND_B_EMAIL
 * (default e2e-3 / e2e-4) and TEST_USER_PASSWORD.
 *
 * Real push delivery: set PUSH_TOKEN to a device's Expo push token (`ExponentPushToken[…]`) and it
 * is registered to account B for the run, so that device gets a "Friend request" push and, once B
 * is offline, a "Table invite" push whose tap opens /online/<room>. A token belongs to one account,
 * so this takes it off the device's own account; the app registers it again on its next launch.
 */

import assert from "node:assert/strict";

const ORIGIN = process.env.AUTH_API_URL ?? "http://localhost:8081";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "wordpoker-e2e";
const A_EMAIL = process.env.FRIEND_A_EMAIL ?? "e2e-3@wordpoker.dev";
const B_EMAIL = process.env.FRIEND_B_EMAIL ?? "e2e-4@wordpoker.dev";
const ROOM_ID = `smokeFriends${Date.now().toString(36)}`;
const PUSH_TOKEN = process.env.PUSH_TOKEN;

/** Signs in and returns a caller bound to that account; the token is never logged. */
async function signIn(email) {
  const response = await fetch(new URL("/api/auth/sign-in/email", ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(ORIGIN).origin },
    body: JSON.stringify({ email, password: PASSWORD }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.token !== "string" || typeof body?.user?.id !== "string") {
    throw new Error(`Sign-in failed for ${email} (HTTP ${response.status}). Seed the E2E users and check AUTH_API_URL.`);
  }
  const call = async (method, path, json) => {
    const res = await fetch(new URL(path, ORIGIN), {
      method,
      headers: { authorization: `Bearer ${body.token}`, ...(json === undefined ? {} : { "content-type": "application/json" }) },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { id: body.user.id, name: body.user.name, email, call };
}

const ids = (rows) => rows.map((row) => row.userId);

async function page(user) {
  const { status, body } = await user.call("GET", "/api/friends");
  assert.equal(status, 200, `GET /api/friends as ${user.email}: ${JSON.stringify(body)}`);
  return body;
}

async function unfriend(a, b) {
  // Either side may hold a request or a friendship; 404 just means there was nothing.
  for (const [from, to] of [[a, b], [b, a]]) {
    const { status } = await from.call("DELETE", `/api/friends/${encodeURIComponent(to.id)}`);
    assert.ok(status === 200 || status === 404, `DELETE friend returned ${status}`);
  }
}

let step = 0;
async function check(label, fn) {
  step += 1;
  try {
    await fn();
    console.log(`✔ ${step}. ${label}`);
  } catch (error) {
    console.error(`✘ ${step}. ${label}`);
    throw error;
  }
}

const a = await signIn(A_EMAIL);
const b = await signIn(B_EMAIL);
console.log(`A = ${a.email}, B = ${b.email}, API = ${ORIGIN}`);

try {
  await check("clean slate: the pair starts unfriended", async () => {
    await unfriend(a, b);
    for (const [me, other] of [[a, b], [b, a]]) {
      const p = await page(me);
      for (const list of [p.friends, p.incoming, p.outgoing]) assert.ok(!ids(list).includes(other.id));
    }
  });

  const codeA = (await page(a)).code;
  const codeB = (await page(b)).code;

  await check("each account has a stable friend code", async () => {
    assert.match(codeA, /^[2-9A-HJKMNP-Z]{8}$/);
    assert.notEqual(codeA, codeB);
    assert.equal((await page(a)).code, codeA);
  });

  await check("bad requests are refused: own code, malformed code, no session", async () => {
    assert.equal((await a.call("POST", "/api/friends", { code: codeA })).status, 400);
    assert.equal((await a.call("POST", "/api/friends", { code: "nope" })).status, 400);
    const anon = await fetch(new URL("/api/friends", ORIGIN), { signal: AbortSignal.timeout(10000) });
    assert.equal(anon.status, 401);
  });

  if (PUSH_TOKEN) {
    await check("B registers the real device's push token", async () => {
      const res = await b.call("POST", "/api/friends/push-token", { token: PUSH_TOKEN });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      console.log("  → the device should now get a \"Friend request\" push");
    });
  }

  await check("A requests B by code; it is outgoing for A and incoming for B", async () => {
    const res = await a.call("POST", "/api/friends", { code: codeB });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.result, "requested");
    assert.deepEqual(ids((await page(a)).outgoing).filter((id) => id === b.id), [b.id]);
    const incoming = (await page(b)).incoming.find((row) => row.userId === a.id);
    assert.equal(incoming?.name, a.name);
  });

  await check("a repeat request is refused as already requested", async () => {
    const res = await a.call("POST", "/api/friends", { code: codeB });
    assert.equal(res.status, 409);
  });

  await check("A cannot accept their own outgoing request", async () => {
    assert.equal((await a.call("PUT", `/api/friends/${encodeURIComponent(b.id)}`)).status, 404);
  });

  await check("B accepts; both list each other as friends and no requests remain", async () => {
    const res = await b.call("PUT", `/api/friends/${encodeURIComponent(a.id)}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    for (const [me, other] of [[a, b], [b, a]]) {
      const p = await page(me);
      assert.ok(ids(p.friends).includes(other.id), `${me.email} should list ${other.email}`);
      assert.ok(!ids(p.incoming).includes(other.id) && !ids(p.outgoing).includes(other.id));
    }
    assert.equal((await a.call("POST", "/api/friends", { code: codeB })).status, 409, "already friends");
  });

  const statusOfB = async () => (await page(a)).friends.find((row) => row.userId === b.id)?.status;

  await check("B's heartbeat shows B online to A, then at a table", async () => {
    const beat = await b.call("POST", "/api/friends/presence", { atTable: false });
    assert.equal(beat.status, 200, JSON.stringify(beat.body));
    assert.ok(Array.isArray(beat.body.invites));
    assert.equal(await statusOfB(), "online");
    assert.equal((await b.call("POST", "/api/friends/presence", { atTable: true })).status, 200);
    assert.equal(await statusOfB(), "at-table");
  });

  await check("A invites B to a table; B receives it on the next heartbeat, once", async () => {
    assert.equal((await a.call("POST", `/api/friends/${encodeURIComponent(b.id)}`, { roomId: "bad room!" })).status, 400);
    const res = await a.call("POST", `/api/friends/${encodeURIComponent(b.id)}`, { roomId: ROOM_ID });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const first = await b.call("POST", "/api/friends/presence", {});
    assert.deepEqual(first.body.invites.filter((invite) => invite.roomId === ROOM_ID), [{ fromName: a.name, roomId: ROOM_ID }]);
    const second = await b.call("POST", "/api/friends/presence", {});
    assert.ok(!second.body.invites.some((invite) => invite.roomId === ROOM_ID), "an invite is delivered once");
  });

  await check("B going offline shows offline to A", async () => {
    assert.equal((await b.call("DELETE", "/api/friends/presence")).status, 200);
    assert.equal(await statusOfB(), "offline");
  });

  if (PUSH_TOKEN) {
    await check("A invites offline B; the device should get a \"Table invite\" push", async () => {
      const res = await a.call("POST", `/api/friends/${encodeURIComponent(b.id)}`, { roomId: ROOM_ID });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      // Take the invite back off B's queue so a later session doesn't show a banner for it.
      await b.call("POST", "/api/friends/presence", {});
      await b.call("DELETE", "/api/friends/presence");
    });
  }

  await check("A removes B; the friendship is gone on both sides and invites are refused", async () => {
    assert.equal((await a.call("DELETE", `/api/friends/${encodeURIComponent(b.id)}`)).status, 200);
    assert.ok(!ids((await page(a)).friends).includes(b.id));
    assert.ok(!ids((await page(b)).friends).includes(a.id));
    assert.equal((await a.call("POST", `/api/friends/${encodeURIComponent(b.id)}`, { roomId: ROOM_ID })).status, 404);
  });

  await check("push tokens: malformed refused, one registered and removed", async () => {
    // Runs after the unfriend, so this throwaway token is never pushed to.
    const token = "ExponentPushToken[smoke-friends-not-a-device]";
    assert.equal((await b.call("POST", "/api/friends/push-token", { token: "nope" })).status, 400);
    assert.equal((await b.call("POST", "/api/friends/push-token", { token })).status, 201);
    assert.equal((await b.call("DELETE", "/api/friends/push-token", { token })).status, 200);
  });

  console.log(`\nFriends smoke passed: ${step} steps.`);
} finally {
  await unfriend(a, b).catch(() => {});
  await b.call("DELETE", "/api/friends/presence").catch(() => {});
  if (PUSH_TOKEN) await b.call("DELETE", "/api/friends/push-token", { token: PUSH_TOKEN }).catch(() => {});
}
