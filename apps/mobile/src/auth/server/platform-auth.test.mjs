/**
 * The platform-auth plugin against a real Better Auth and a real Postgres (STO-593): sessions,
 * ownership, guest adoption and restore pointers, with the provider verifiers faked. Skipped
 * without TEST_DATABASE_URL; run through `pnpm --filter @wordpoker/mobile test:auth`.
 */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { anonymous, bearer } from "better-auth/plugins";
import pg from "pg";

const serverUrl = process.env.TEST_DATABASE_URL;

describe("platform-auth plugin", { skip: !serverUrl && "no TEST_DATABASE_URL" }, () => {
  const database = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let admin;
  let pool;
  let db;
  let auth;
  let PlatformAuthError;
  const ready = [];

  const makeAuth = async (verifiers, extra = {}) => {
    const { platformAuth } = await import("./platform-auth.ts");
    return betterAuth({
      baseURL: "http://auth.test",
      secret: "platform-auth-test-secret-with-at-least-32-characters",
      database: pool,
      emailAndPassword: { enabled: true },
      rateLimit: { storage: "database", enabled: false },
      user: { additionalFields: { primaryIdentityVerified: { type: "boolean", defaultValue: false, required: false, input: false } } },
      plugins: [
        bearer(),
        anonymous({
          onLinkAccount: async ({ anonymousUser, newUser }) => {
            await db.inTransaction(pool, (sql) => db.adoptGuestHistory(sql, anonymousUser.user.id, newUser.user.id));
          },
        }),
        platformAuth({ pool, verifiers, onAccountReady: async (user, info) => void ready.push({ user, created: info.created }) }),
      ],
      ...extra,
    });
  };

  before(async () => {
    const base = new URL(serverUrl);
    admin = new pg.Client({ connectionString: serverUrl });
    await admin.connect();
    await admin.query(`create database "${database}"`);
    base.pathname = `/${database}`;
    // @wordpoker/db reads its connection when first imported, so it is imported after this.
    process.env.DATABASE_URL = base.toString();
    pool = new pg.Pool({ connectionString: base.toString(), max: 8 });
    ({ PlatformAuthError } = await import("./platform-auth.ts"));
    db = await import("@wordpoker/db");
    auth = await makeAuth({
      gameCenter: async (proof) => {
        if (proof.signatureBase64 === "bad") throw new PlatformAuthError("INVALID_PROOF");
        return { teamPlayerId: proof.teamPlayerID, proofHash: createHash("sha256").update(proof.signatureBase64).digest("hex"), displayName: "Ada" };
      },
      playGames: async (code) => ({ applicationId: "app", playerId: code }),
    });
    await (await getMigrations(auth.options)).runMigrations();
    await (await db.getOrm()).migrator.up();
  });

  after(async () => {
    await db?.closeOrm();
    await pool?.end();
    await admin?.query(`drop database if exists "${database}" with (force)`);
    await admin?.end();
  });

  const call = (instance, path, body, headers = {}, method = "POST") =>
    instance.handler(new Request(`http://auth.test/api/auth${path}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://auth.test", ...headers },
      ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    }));
  const post = (path, body, headers) => call(auth, path, body, headers);
  const cookieOf = (response) => response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  const sessionOf = async (headers) => (await call(auth, "/get-session", undefined, headers, "GET")).json();
  const codeOf = async (response) => (await response.json()).code;
  let n = 0;
  const proof = (teamPlayerID, signatureBase64 = `sig-${++n}`) => ({
    teamPlayerID, bundleId: "com.wordpoker.wordpoker", publicKeyURL: "https://static.gc.apple.com/public-key/gc-prod-10.cer",
    signatureBase64, saltBase64: "c2FsdA==", timestamp: "1760000000000",
  });
  const begin = async (provider, intent, headers) => (await (await post("/platform-auth/begin", { provider, intent }, headers)).json()).attemptToken;
  const gameCenter = async (accountId, headers = {}, extra = {}) =>
    post("/platform-auth/game-center", { attemptToken: await begin("game-center", extra.intent ?? "sign-in", headers), proof: proof(accountId), ...(extra.adopt ? { adoptGuestProgress: true } : {}) }, headers);

  it("Game Center creates one eligible account, then signs back into it", async () => {
    const first = await gameCenter("T:ada");
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { outcome: "signed-in" });
    const bearerToken = first.headers.get("set-auth-token");
    const session = await sessionOf({ cookie: cookieOf(first) });
    assert.equal(session.user.primaryIdentityVerified, true);
    assert.equal(session.user.emailVerified, false);
    assert.match(session.user.email, /\.placeholder\.invalid$/);
    assert.equal((await sessionOf({ authorization: `Bearer ${bearerToken}` })).user.id, session.user.id);
    assert.deepEqual(ready.at(-1), { user: { id: session.user.id, isAnonymous: false, emailVerified: false, primaryIdentityVerified: true }, created: true });

    const again = await gameCenter("T:ada");
    assert.equal((await sessionOf({ cookie: cookieOf(again) })).user.id, session.user.id);
    assert.equal(ready.at(-1).created, false);
    await post("/sign-out", {}, { cookie: cookieOf(again) });
    assert.equal(await sessionOf({ cookie: cookieOf(again) }), null);
  });

  it("racing sign-ins for a new identity land on one account", async () => {
    const responses = await Promise.all([gameCenter("T:race"), gameCenter("T:race"), gameCenter("T:race")]);
    const ids = await Promise.all(responses.map(async (response) => (await sessionOf({ cookie: cookieOf(response) })).user.id));
    assert.equal(new Set(ids).size, 1);
    assert.equal((await pool.query(`select count(*)::int as n from account where "accountId" = 'T:race'`)).rows[0].n, 1);
  });

  it("refuses replayed proofs, spent attempts, bad proofs and stray fields without side effects", async () => {
    const replay = proof("T:replay", "same-signature");
    const used = await post("/platform-auth/game-center", { attemptToken: await begin("game-center", "sign-in"), proof: replay });
    assert.equal(used.status, 200);
    const replayed = await post("/platform-auth/game-center", { attemptToken: await begin("game-center", "sign-in"), proof: replay });
    assert.equal(replayed.status, 409);
    assert.equal(await codeOf(replayed), "PROOF_REPLAYED");
    assert.equal(replayed.headers.getSetCookie().length, 0);

    const token = await begin("game-center", "sign-in");
    await post("/platform-auth/game-center", { attemptToken: token, proof: proof("T:spent") });
    const spent = await post("/platform-auth/game-center", { attemptToken: token, proof: proof("T:spent") });
    assert.equal(await codeOf(spent), "PROOF_EXPIRED");

    const bad = await post("/platform-auth/game-center", { attemptToken: await begin("game-center", "sign-in"), proof: proof("T:bad", "bad") });
    assert.equal(bad.status, 401);
    assert.equal(await codeOf(bad), "INVALID_PROOF");
    assert.equal(await db.providerOwner(pool, "game-center", "T:bad"), null);

    const stray = await post("/platform-auth/game-center", { attemptToken: await begin("game-center", "sign-in"), proof: proof("T:x"), userId: "someone" });
    assert.equal(await codeOf(stray), "INVALID_INPUT");
    const huge = await post("/platform-auth/begin", JSON.stringify({ provider: "game-center", intent: "sign-in", pad: "x".repeat(17 * 1024) }));
    assert.equal(huge.status, 413);
  });

  it("links to the signed-in account, refuses an identity another account owns, and never takes the flag as input", async () => {
    const signUp = await post("/sign-up/email", { name: "Bea", email: "bea@example.test", password: "fixture-password" });
    const headers = { cookie: cookieOf(signUp) };
    const stolen = await post("/update-user", { primaryIdentityVerified: true }, headers);
    assert.notEqual(stolen.status, 200);
    assert.equal((await sessionOf(headers)).user.primaryIdentityVerified, false);

    assert.equal(await codeOf(await post("/platform-auth/begin", { provider: "game-center", intent: "sign-in" }, headers)), "SESSION_CHANGED");
    assert.equal(await codeOf(await post("/platform-auth/begin", { provider: "game-center", intent: "link" })), "SESSION_REQUIRED");

    const linked = await gameCenter("T:bea", headers, { intent: "link" });
    assert.deepEqual(await linked.json(), { outcome: "linked" });
    assert.equal(linked.headers.getSetCookie().length, 0, "linking keeps the current session");
    assert.equal((await sessionOf(headers)).user.primaryIdentityVerified, true);

    const taken = await gameCenter("T:ada", headers, { intent: "link" });
    assert.equal(await codeOf(taken), "IDENTITY_IN_USE");
    assert.notEqual(await db.providerOwner(pool, "game-center", "T:ada"), (await sessionOf(headers)).user.id);
  });

  it("a guest moves into a Game Center account only with consent, and only under its own session", async () => {
    const guest = await post("/sign-in/anonymous", {});
    const headers = { cookie: cookieOf(guest) };
    const guestId = (await sessionOf(headers)).user.id;

    assert.equal(await codeOf(await gameCenter("T:guest", headers)), "ADOPTION_REQUIRED");
    const token = await begin("game-center", "sign-in", headers);
    const unbound = await post("/platform-auth/game-center", { attemptToken: token, proof: proof("T:guest"), adoptGuestProgress: true });
    assert.equal(await codeOf(unbound), "SESSION_CHANGED");

    const saved = await gameCenter("T:guest", headers, { adopt: true });
    assert.equal(saved.status, 200);
    const userId = (await sessionOf({ cookie: cookieOf(saved) })).user.id;
    assert.deepEqual((await pool.query(`select user_id from guest_adoption where guest_id = $1`, [guestId])).rows, [{ user_id: userId }]);
    assert.equal((await pool.query(`select count(*)::int as n from "user" where id = $1`, [guestId])).rows[0].n, 0);
  });

  it("Play Games restores only an associated, eligible account and replaces a pointer only on confirmation", async () => {
    const restore = (code) => begin("play-games", "restore").then((attemptToken) => post("/platform-auth/play-games", { attemptToken, serverAuthCode: code }));
    const unknown = await restore("player-1");
    assert.deepEqual(await unknown.json(), { outcome: "not-linked" });
    assert.equal(unknown.headers.getSetCookie().length, 0);

    const guest = { cookie: cookieOf(await post("/sign-in/anonymous", {})) };
    assert.equal(await codeOf(await post("/platform-auth/begin", { provider: "play-games", intent: "associate" }, guest)), "SESSION_REQUIRED");

    const ada = { cookie: cookieOf(await gameCenter("T:ada")) };
    const associate = async (headers, expectedVersion) => post("/platform-auth/play-games", {
      attemptToken: await begin("play-games", "associate", headers), serverAuthCode: "player-1", ...(expectedVersion ? { expectedVersion } : {}),
    }, headers);
    assert.deepEqual(await (await associate(ada)).json(), { outcome: "associated" });

    const restored = await restore("player-1");
    assert.deepEqual(await restored.json(), { outcome: "restored" });
    const adaId = (await sessionOf(ada)).user.id;
    assert.equal((await sessionOf({ cookie: cookieOf(restored) })).user.id, adaId);

    const cal = { cookie: cookieOf(await gameCenter("T:cal")) };
    const changed = await associate(cal);
    assert.equal(changed.status, 409);
    assert.deepEqual(await changed.json().then(({ code, version }) => ({ code, version })), { code: "ASSOCIATION_CHANGED", version: 1 });
    assert.deepEqual(await (await associate(cal, 1)).json(), { outcome: "associated" });
    assert.notEqual((await sessionOf({ cookie: cookieOf(await restore("player-1")) })).user.id, adaId);
  });

  it("a provider without a verifier is disabled, and limits hold in the database", async () => {
    const disabled = await makeAuth({});
    const refused = await call(disabled, "/platform-auth/begin", { provider: "game-center", intent: "sign-in" });
    assert.equal(refused.status, 503);
    assert.equal(await codeOf(refused), "DISABLED");

    const limited = await makeAuth({ gameCenter: async () => ({ teamPlayerId: "T", proofHash: "h" }) }, { rateLimit: { storage: "database", enabled: true } });
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await call(limited, "/platform-auth/begin", { provider: "game-center", intent: "sign-in" })).status);
    assert.deepEqual(statuses, [...Array(10).fill(200), 429]);
  });

  it("with the real Game Center verifier, a proof works once across workers and a fresh one finds the same account", async () => {
    const { gameCenterVerifier } = await import("./game-center.ts");
    const fx = await import("./game-center.fixtures.mjs");
    const bundleId = "com.wordpoker.wordpoker";
    // Two API replicas: separate Better Auth instances and verifiers, one database.
    const worker = () => makeAuth({
      gameCenter: gameCenterVerifier({ bundleId, trust: { intermediates: [fx.INTERMEDIATE], roots: [fx.ROOT] }, now: () => Date.parse("2027-01-01T00:00:00Z"), fetchKey: async () => ({ body: Buffer.from(fx.LEAF) }) }),
    });
    const [first, second] = [await worker(), await worker()];
    const signedProof = (salt) => {
      const timestamp = String(Date.parse("2027-01-01T00:00:00Z"));
      const stamp = Buffer.alloc(8);
      stamp.writeBigUInt64BE(BigInt(timestamp));
      const payload = Buffer.concat([Buffer.from("T:real"), Buffer.from(bundleId), stamp, Buffer.from(salt)]);
      return {
        teamPlayerID: "T:real", bundleId, publicKeyURL: "https://static.gc.apple.com/public-key/gc-prod-12.cer", timestamp,
        saltBase64: Buffer.from(salt).toString("base64"), signatureBase64: sign("sha256", payload, createPrivateKey(fx.LEAF_KEY)).toString("base64"),
      };
    };
    const exchange = async (instance, proofBody) => {
      const attemptToken = (await (await call(instance, "/platform-auth/begin", { provider: "game-center", intent: "sign-in" })).json()).attemptToken;
      return call(instance, "/platform-auth/game-center", { attemptToken, proof: proofBody });
    };

    const proofOnce = signedProof("salt-1");
    const signedIn = await exchange(first, proofOnce);
    assert.equal(signedIn.status, 200);
    const userId = (await sessionOf({ cookie: cookieOf(signedIn) })).user.id;

    // The response was lost and the same proof is retried on the other replica: refused, no session.
    const replayed = await exchange(second, proofOnce);
    assert.equal(await codeOf(replayed), "PROOF_REPLAYED");
    assert.equal(replayed.headers.getSetCookie().length, 0);

    const retried = await exchange(second, signedProof("salt-2"));
    assert.equal((await sessionOf({ cookie: cookieOf(retried) })).user.id, userId);

    const tampered = { ...signedProof("salt-3"), teamPlayerID: "T:someone-else" };
    assert.equal(await codeOf(await exchange(first, tampered)), "INVALID_PROOF");
    assert.equal(await db.providerOwner(pool, "game-center", "T:someone-else"), null);
  });
});
