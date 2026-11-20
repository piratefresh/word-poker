/**
 * Sets up the Friends screen for the `friends-social` Maestro flow: the app's E2E account (`e2e`)
 * gets two friends, one offline with a fresh "last seen" (`e2e-3`) and one at a table (`e2e-4`),
 * whose heartbeat this script keeps up until it is stopped, so their Join stays on screen.
 *
 * It talks to the real API routes as the seeded users, like `smoke-friends.mjs`, so it needs the
 * API running with this checkout's routes (Expo with EXPO_PUBLIC_LOCAL_API=1), the friends-social
 * migration applied, and `pnpm seed:test-users`. The at-table friend's room is made up, so Join
 * lands on the table screen's "That table is full or has just closed." — which is what proves
 * Join routed to the friend's table.
 *
 * Usage, from the repo root (leave it running while the flow runs, then Ctrl-C):
 *   node scripts/friends-social-fixture.mjs
 *   node scripts/friends-social-fixture.mjs --reset   # unfriend the pair again and exit
 *
 * Overrides: AUTH_API_URL (default http://localhost:8081), TEST_USER_EMAIL, FRIEND_A_EMAIL,
 * FRIEND_B_EMAIL, TEST_USER_PASSWORD. The nudge cooldown is per pair, so a second run within four
 * hours sees "You nudged them recently"; the flow accepts either answer.
 */

const ORIGIN = process.env.AUTH_API_URL ?? "http://localhost:8081";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "wordpoker-e2e";
const APP_EMAIL = process.env.TEST_USER_EMAIL ?? "e2e@wordpoker.dev";
const OFFLINE_EMAIL = process.env.FRIEND_A_EMAIL ?? "e2e-3@wordpoker.dev";
const TABLE_EMAIL = process.env.FRIEND_B_EMAIL ?? "e2e-4@wordpoker.dev";
const ROOM_ID = `socialJoin${Date.now().toString(36)}`;
const BEAT_MS = 15_000;

async function signIn(email) {
  const response = await fetch(new URL("/api/auth/sign-in/email", ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(ORIGIN).origin },
    body: JSON.stringify({ email, password: PASSWORD }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.token !== "string") {
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

async function befriend(me, other) {
  const { body } = await other.call("GET", "/api/friends");
  const sent = await me.call("POST", "/api/friends", { code: body.code });
  if (sent.status === 201) {
    const accepted = await other.call("PUT", `/api/friends/${encodeURIComponent(me.id)}`);
    if (accepted.status !== 200) throw new Error(`${other.email} couldn't accept: ${JSON.stringify(accepted.body)}`);
  } else if (sent.status !== 200 && sent.status !== 409) {
    throw new Error(`${me.email} couldn't add ${other.email}: ${JSON.stringify(sent.body)}`);
  }
}

const [app, offline, table] = await Promise.all([APP_EMAIL, OFFLINE_EMAIL, TABLE_EMAIL].map(signIn));

if (process.argv.includes("--reset")) {
  for (const friend of [offline, table]) {
    await app.call("DELETE", `/api/friends/${encodeURIComponent(friend.id)}`);
    await friend.call("DELETE", "/api/friends/presence");
  }
  console.log("Reset: the pair are no longer friends with", app.email);
  process.exit(0);
}

await befriend(app, offline);
await befriend(app, table);

// Offline, seen just now: one beat, then the app "closes".
await offline.call("POST", "/api/friends/presence", { atTable: false });
await offline.call("DELETE", "/api/friends/presence");

const beat = () => table.call("POST", "/api/friends/presence", { atTable: true, roomId: ROOM_ID });
const first = await beat();
if (first.status !== 200) throw new Error(`Heartbeat refused: ${JSON.stringify(first.body)}`);
const timer = setInterval(() => { void beat(); }, BEAT_MS);

const list = (await app.call("GET", "/api/friends")).body;
const row = (user) => list.friends.find((friend) => friend.userId === user.id);
if (row(table)?.roomId !== ROOM_ID) {
  console.warn("The at-table friend came back without their room. Is the API running this checkout, with the migration applied?");
}

console.log(`Ready. ${app.email} has ${offline.name} offline (${row(offline)?.lastSeen ? "last seen sent" : "no last seen!"}) and ${table.name} at ${ROOM_ID}.`);
console.log("Run the flow in another terminal, e.g.:");
console.log(`  maestro test -e OFFLINE_ID=${offline.id} -e TABLE_ID=${table.id} apps/mobile/.maestro/native/friends-social.yaml`);
console.log(`  maestro test -e OFFLINE_ID=${offline.id} -e TABLE_ID=${table.id} .maestro/friends-social.yaml`);
console.log("Holding the at-table heartbeat. Ctrl-C to stop.");

process.on("SIGINT", async () => {
  clearInterval(timer);
  await table.call("DELETE", "/api/friends/presence").catch(() => {});
  process.exit(0);
});
