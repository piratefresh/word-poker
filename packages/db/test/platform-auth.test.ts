import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client, Pool } from "pg";
import {
  ProofReplayedError,
  accountStanding,
  adoptGuestHistory,
  consumeAttempt,
  countPlayedHands,
  createProviderUser,
  inTransaction,
  linkProvider,
  openAttempt,
  peekAttempt,
  pointRestore,
  providerOwner,
  restorePointer,
} from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("platform auth ownership", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  let pool: Pool;
  const sql = (text: string, values?: unknown[]) => pool.query(text, values);
  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "platform-auth");
    orm = await openRunOrm(target);
    await orm.migrator.up();
    pool = new Pool({ connectionString: target.url, max: 6, ...(target.schema ? { options: `-c search_path=${target.schema}` } : {}) });
    await sql(`insert into "user" (id, name, email, "emailVerified", "isAnonymous") values
      ('A','Ada','a@x.test',true,false), ('B','Bea','b@x.test',false,false), ('G','Guest','g@x.invalid',false,true)`);
  });
  after(async () => {
    await pool?.end();
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });

  it("two requests for one new identity make one owner and no orphan user", async () => {
    const before = Number((await sql(`select count(*) from "user"`)).rows[0].count);
    const claims = await Promise.all([1, 2, 3].map(() =>
      inTransaction(pool, (tx) => createProviderUser(tx, { providerId: "game-center", accountId: "T:race", name: "Player" }))));
    assert.equal(new Set(claims.map((claim) => claim.userId)).size, 1);
    assert.equal(claims.filter((claim) => claim.created).length, 1);
    assert.equal(Number((await sql(`select count(*) from "user"`)).rows[0].count), before + 1);
    const standing = await accountStanding(pool, claims[0]!.userId);
    assert.deepEqual(standing, { isAnonymous: false, emailVerified: false, primaryIdentityVerified: true });
    const { rows } = await sql(`select email from "user" where id = $1`, [claims[0]!.userId]);
    assert.match(rows[0].email, /@game-center\.placeholder\.invalid$/);
  });

  it("linking is idempotent for the owner and a conflict for anyone else", async () => {
    assert.equal(await inTransaction(pool, (tx) => linkProvider(tx, "B", "game-center", "T:b")), "linked");
    assert.equal(await inTransaction(pool, (tx) => linkProvider(tx, "B", "game-center", "T:b")), "linked");
    assert.equal(await inTransaction(pool, (tx) => linkProvider(tx, "A", "game-center", "T:b")), "in-use");
    assert.equal(await providerOwner(pool, "game-center", "T:b"), "B");
    assert.equal((await accountStanding(pool, "B"))?.primaryIdentityVerified, true);
    assert.equal((await accountStanding(pool, "A"))?.primaryIdentityVerified, false);
  });

  it("a guest adopted by two accounts at once moves to exactly one", async () => {
    await sql(`insert into "user" (id, name, "isAnonymous") values ('G2','Guest',true), ('T1','One',false), ('T2','Two',false)`);
    await sql(`insert into game_session (id, owner_id, mode) values (gen_random_uuid(), 'G2', 'offline'), (gen_random_uuid(), 'G2', 'offline')`);
    const results = await Promise.all(["T1", "T2"].map((userId) =>
      inTransaction(pool, (tx) => adoptGuestHistory(tx, "G2", userId))));
    assert.deepEqual(results.toSorted(), [false, true]);
    const winner = results[0] ? "T1" : "T2";
    const { rows } = await sql(`select owner_id, count(*)::int as n from game_session where owner_id in ('G2','T1','T2') group by owner_id`);
    assert.deepEqual(rows, [{ owner_id: winner, n: 2 }]);
    assert.equal(await inTransaction(pool, (tx) => adoptGuestHistory(tx, "G2", winner)), true);
    assert.equal(await countPlayedHands(winner, { orm }), 0);
  });

  it("attempts are single-use, session-bound, and a proof cannot be spent twice", async () => {
    await inTransaction(pool, (tx) => openAttempt(tx, { tokenHash: "h1", provider: "game-center", intent: "link", sessionId: "s1", userId: "A" }));
    await inTransaction(pool, (tx) => openAttempt(tx, { tokenHash: "h2", provider: "game-center", intent: "link", sessionId: "s1", userId: "A" }));
    assert.equal(await peekAttempt(pool, "h1", "play-games"), null);
    assert.deepEqual(await peekAttempt(pool, "h1", "game-center"), { intent: "link", sessionId: "s1", userId: "A" });
    assert.equal(await inTransaction(pool, (tx) => consumeAttempt(tx, "h1", "game-center", "s2", "p1")), null);
    assert.equal((await inTransaction(pool, (tx) => consumeAttempt(tx, "h1", "game-center", "s1", "p1")))?.userId, "A");
    assert.equal(await inTransaction(pool, (tx) => consumeAttempt(tx, "h1", "game-center", "s1", "p1")), null);
    await assert.rejects(inTransaction(pool, (tx) => consumeAttempt(tx, "h2", "game-center", "s1", "p1")), ProofReplayedError);
    assert.notEqual(await peekAttempt(pool, "h2", "game-center"), null, "the replay rolled back without consuming");
    await sql(`update platform_auth_attempt set expires_at = now() - interval '1 second' where token_hash = 'h2'`);
    assert.equal(await peekAttempt(pool, "h2", "game-center"), null);
  });

  it("restore pointers replace only with the confirmed version, and die with their account", async () => {
    const point = (userId: string, expectedVersion?: number) =>
      inTransaction(pool, (tx) => pointRestore(tx, { applicationId: "app", playerId: "p", userId, expectedVersion }));
    const racing = await Promise.all([point("A"), point("A")]);
    assert.deepEqual(racing, [{ associated: true }, { associated: true }]);
    assert.deepEqual(await point("B"), { associated: false, version: 1 });
    assert.deepEqual(await point("B", 2), { associated: false, version: 1 });
    const swaps = await Promise.all([point("B", 1), point("B", 1)]);
    assert.deepEqual(swaps, [{ associated: true }, { associated: true }], "the same replacement twice is idempotent");
    assert.deepEqual(await restorePointer(pool, "app", "p"), { userId: "B", version: 2 });
    await sql(`insert into "user" (id, name, "isAnonymous") values ('D','Doomed',false)`);
    await point("D", 2);
    await sql(`delete from "user" where id = 'D'`);
    assert.equal(await restorePointer(pool, "app", "p"), null);
  });
});
