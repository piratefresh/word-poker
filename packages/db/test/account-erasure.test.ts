import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { eraseAccountData, type Sql } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("eraseAccountData", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  const online = "00000000-0000-4000-8000-000000000001";
  const offline = "00000000-0000-4000-8000-000000000002";
  const hand = "00000000-0000-4000-8000-000000000003";
  const offlineHand = "00000000-0000-4000-8000-000000000004";
  const digest = "a".repeat(64);
  const rows = (sql: string) => orm.em.getConnection().execute<Record<string, unknown>[]>(sql);

  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "erasure");
    orm = await openRunOrm(target);
    await orm.migrator.up();
    const db = orm.em.getConnection();
    await db.execute(`insert into "user" (id, name, "isAnonymous") values ('A','Ada',false), ('B','Bea',false)`);
    await db.execute(`insert into friends (user_a, user_b, status, requested_by) values ('A','B','accepted','A')`);
    await db.execute(`insert into friend_code (user_id, code) values ('A','AAAA'), ('B','BBBB')`);
    await db.execute(`insert into referral (referee_id, referrer_id) values ('B','A')`);
    await db.execute(`insert into presence (user_id, seen_at) values ('A', now()), ('B', now())`);
    await db.execute(`insert into push_token (token, user_id) values ('ta','A'), ('tb','B')`);
    await db.execute(`insert into player_progress (user_id) values ('A'), ('B')`);
    await db.execute(`insert into guest_adoption (guest_id, user_id) values ('G','A')`);
    await db.execute(`insert into wallet_event (user_id, kind, amount, status) values ('A','welcome',100,'applied'), ('A','quest',5,'pending'), ('B','quest',5,'pending')`);
    await db.execute(`insert into game_session (id, mode, owner_id) values (?, 'online', null), (?, 'offline', 'A')`, [online, offline]);
    for (const [id, session, mode] of [[hand, online, "online"], [offlineHand, offline, "offline"]]) {
      await db.execute(
        `insert into game_hand (id, session_id, mode, hand_no, started_at, ended_at, version, ranked, seed, dealer_seat,
           rules_version, dictionary_id, dictionary_fingerprint, payload_digest, config, summary)
         values (?, ?, ?, 1, now(), now(), 1, false, 1, 0, 'r', 'd', ?, ?, '{}', '{}')`,
        [id, session, mode, digest, digest],
      );
    }
    await db.execute(`insert into hand_seat (hand_id, seat, player_id, user_id, name, initial_stack, adopted_from) values (?, 0, 'pa', 'A', 'Ada', 100, 'G'), (?, 1, 'pb', 'B', 'Bea', 100, null)`, [hand, hand]);
    await db.execute(`insert into hand_seat (hand_id, seat, player_id, user_id, name, initial_stack) values (?, 0, 'pa', 'A', 'Ada', 100)`, [offlineHand]);

    const client = new Client({ connectionString: target.url });
    await client.connect();
    if (target.schema) await client.query(`set search_path to "${target.schema}"`);
    await eraseAccountData(client as Sql, "A");
    await eraseAccountData(client as Sql, "A"); // A failed delete is retried.
    await client.end();
  });
  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });

  it("removes the player's own rows and leaves the other player's", async () => {
    assert.deepEqual(await rows(`select * from friends`), []);
    assert.deepEqual(await rows(`select * from referral`), []);
    assert.deepEqual(await rows(`select * from guest_adoption`), []);
    assert.deepEqual(await rows(`select user_id from friend_code`), [{ user_id: "B" }]);
    assert.deepEqual(await rows(`select user_id from presence`), [{ user_id: "B" }]);
    assert.deepEqual(await rows(`select user_id from push_token`), [{ user_id: "B" }]);
    assert.deepEqual(await rows(`select user_id from player_progress`), [{ user_id: "B" }]);
  });

  it("keeps shared hands with the seat anonymous, and removes offline sessions", async () => {
    assert.deepEqual(await rows(`select user_id, adopted_from, name from hand_seat order by seat`), [
      { user_id: null, adopted_from: null, name: "Anonymous" },
      { user_id: "B", adopted_from: null, name: "Bea" },
    ]);
    assert.deepEqual(await rows(`select id from game_session`), [{ id: online }]);
  });

  it("keeps the wallet log but stops the player's pending rows", async () => {
    assert.deepEqual(await rows(`select user_id, kind, status from wallet_event order by user_id, kind`), [
      { user_id: "A", kind: "quest", status: "failed" },
      { user_id: "A", kind: "welcome", status: "applied" },
      { user_id: "B", kind: "quest", status: "pending" },
    ]);
  });
});
