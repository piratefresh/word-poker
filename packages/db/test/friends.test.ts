import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { isFriendCode } from "@wordpoker/contracts";
import { acceptFriend, areFriends, friendCode, friendList, paidReferralCount, recordReferral, referralCount, referrerOf, removeFriend, requestFriend, userForFriendCode } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("friends", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "friends");
    orm = await openRunOrm(target);
    await orm.migrator.up();
    await orm.em.getConnection().execute(`insert into "user" (id, name, "isAnonymous") values ('A','Ada',false), ('B','Bea',false), ('C','Cal',false), ('G','Guest',true)`);
  });
  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });
  beforeEach(async () => { await orm.em.getConnection().execute(`delete from friends`); });

  it("request/accept lists both sides; only the recipient can accept", async () => {
    assert.equal(await requestFriend("A", "B", { orm }), "requested");
    assert.deepEqual((await friendList("A", { orm })).outgoing, [{ userId: "B", name: "Bea" }]);
    assert.deepEqual((await friendList("B", { orm })).incoming, [{ userId: "A", name: "Ada" }]);
    assert.equal(await acceptFriend("A", "B", { orm }), false);
    assert.equal(await acceptFriend("C", "B", { orm }), false);
    assert.equal(await acceptFriend("B", "A", { orm }), true);
    assert.equal(await acceptFriend("B", "A", { orm }), false);
    assert.equal(await areFriends("A", "B", { orm }), true);
    assert.equal(await areFriends("B", "A", { orm }), true);
    assert.deepEqual((await friendList("A", { orm })).friends, [{ userId: "B", name: "Bea" }]);
    assert.deepEqual((await friendList("B", { orm })).friends, [{ userId: "A", name: "Ada" }]);
    assert.equal(await requestFriend("A", "B", { orm }), "already-friends");
  });

  it("refuses self, duplicate, missing and guest accounts", async () => {
    assert.equal(await requestFriend("A", "A", { orm }), "self");
    assert.equal(await requestFriend("A", "G", { orm }), "guest");
    assert.equal(await requestFriend("G", "A", { orm }), "guest");
    assert.equal(await requestFriend("A", "unknown", { orm }), "not-found");
    assert.equal(await requestFriend("unknown", "A", { orm }), "not-found");
    assert.equal(await requestFriend("A", "B", { orm }), "requested");
    assert.equal(await requestFriend("A", "B", { orm }), "already-requested");
  });

  it("crossing requests accept, including concurrent requests", async () => {
    const results = await Promise.all([requestFriend("A", "B", { orm }), requestFriend("B", "A", { orm })]);
    assert.deepEqual(results.sort(), ["accepted", "requested"]);
    assert.equal(await areFriends("A", "B", { orm }), true);
    await removeFriend("A", "B", { orm });
    const duplicates = await Promise.all([requestFriend("A", "B", { orm }), requestFriend("A", "B", { orm })]);
    assert.deepEqual(duplicates.sort(), ["already-requested", "requested"]);
  });

  it("decline, cancel and unfriend clear the relationship for both", async () => {
    for (const [who, accept] of [["A", false], ["B", false], ["B", true]] as const) {
      await requestFriend("A", "B", { orm });
      if (accept) await acceptFriend("B", "A", { orm });
      assert.equal(await removeFriend(who, who === "A" ? "B" : "A", { orm }), true);
      assert.equal(await areFriends("A", "B", { orm }), false);
      assert.deepEqual(await friendList("A", { orm }), { friends: [], incoming: [], outgoing: [] });
      assert.deepEqual(await friendList("B", { orm }), { friends: [], incoming: [], outgoing: [] });
    }
    assert.equal(await removeFriend("C", "B", { orm }), false);
  });

  it("Postgres enforces ordered unique pairs and valid requester/status", async () => {
    const db = orm.em.getConnection();
    await requestFriend("A", "B", { orm });
    for (const args of [["B", "A", "pending", "B"], ["A", "B", "pending", "A"], ["A", "C", "pending", "B"], ["A", "C", "invalid", "A"]]) {
      await assert.rejects(db.execute(`insert into friends (user_a,user_b,status,requested_by) values (?,?,?,?)`, args));
    }
  });

  it("codes are stable across concurrent creation, public and unique", async () => {
    const codes = await Promise.all([friendCode("A", { orm }), friendCode("A", { orm }), friendCode("B", { orm })]);
    assert.equal(codes[0], codes[1]);
    assert.notEqual(codes[0], codes[2]);
    assert.ok(isFriendCode(codes[0]));
    const first = codes[0];
    assert.ok(first);
    assert.equal(await userForFriendCode(first, { orm }), "A");
    assert.equal(await userForFriendCode(await friendCode("G", { orm }), { orm }), null);
  });

  it("orphaned and guest relationships are invisible to reads", async () => {
    await requestFriend("A", "C", { orm });
    await acceptFriend("C", "A", { orm });
    await orm.em.getConnection().execute(`update "user" set "isAnonymous" = true where id = 'C'`);
    assert.deepEqual((await friendList("A", { orm })).friends, []);
    assert.equal(await areFriends("A", "C", { orm }), false);
    await orm.em.getConnection().execute(`delete from "user" where id = 'C'`);
    assert.deepEqual((await friendList("A", { orm })).friends, []);
  });

  it("a referral is recorded once; guests, unknown codes and self are refused", async () => {
    const db = orm.em.getConnection();
    await db.execute(`delete from referral`);
    const code = await friendCode("A", { orm });
    assert.equal(await recordReferral("B", code, { orm }), true);
    assert.equal(await recordReferral("B", await friendCode("C", { orm }), { orm }), false, "only once");
    assert.equal(await referrerOf("B", { orm }), "A");
    assert.equal(await recordReferral("A", code, { orm }), false, "self");
    assert.equal(await recordReferral("C", "ZZZZZZZZ", { orm }), false, "unknown code");
    assert.equal(await recordReferral("C", await friendCode("G", { orm }), { orm }), false, "guest referrer");
    assert.equal(await referrerOf("C", { orm }), null);
    assert.equal(await referralCount("A", { orm }), 1);
  });

  it("counts only the referrer-side referral grants", async () => {
    const db = orm.em.getConnection();
    await db.execute(`insert into wallet_event (user_id, kind, amount, status, ref) values ('A','referral',500,'applied','referee'), ('A','referral',1000,'applied','B'), ('A','welcome',5000,'applied',null)`);
    assert.equal(await paidReferralCount("A", { orm }), 1);
    await assert.rejects(db.execute(`insert into wallet_event (user_id, kind, amount, status, ref) values ('A','referral',1000,'applied','B')`));
  });
});
