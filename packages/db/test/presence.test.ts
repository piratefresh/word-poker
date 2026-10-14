import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { acceptFriend, beat, friendList, goOffline, inviteToTable, isOnline, requestFriend, takeInvites } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("presence", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  const sql = (text: string, args: unknown[] = []) => orm.em.getConnection().execute(text, args);
  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "presence");
    orm = await openRunOrm(target);
    await orm.migrator.up();
    await sql(`insert into "user" (id, name, "isAnonymous") values ('A','Ada',false), ('B','Bea',false), ('C','Cal',false)`);
  });
  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });
  beforeEach(async () => {
    await sql(`delete from friends`);
    await sql(`delete from presence`);
    await sql(`delete from table_invite`);
    await requestFriend("A", "B", { orm });
    await acceptFriend("B", "A", { orm });
  });

  it("a first beat comes online and is announced; a follow-up is neither", async () => {
    assert.deepEqual(await beat("A", false, { orm }), { cameOnline: true, announce: true });
    assert.equal(await isOnline("A", { orm }), true);
    assert.deepEqual(await beat("A", false, { orm }), { cameOnline: false, announce: false });
  });

  it("a stale player comes online again, but is announced only once per throttle window", async () => {
    await beat("A", false, { orm });
    await sql(`update presence set seen_at = now() - interval '2 minutes'`);
    assert.equal(await isOnline("A", { orm }), false);
    assert.deepEqual(await beat("A", false, { orm }), { cameOnline: true, announce: false });
    await goOffline("A", { orm });
    assert.deepEqual(await beat("A", false, { orm }), { cameOnline: true, announce: false });
    await sql(`update presence set seen_at = now() - interval '2 minutes', announced_at = now() - interval '4 hours'`);
    assert.deepEqual(await beat("A", false, { orm }), { cameOnline: true, announce: true });
  });

  it("friends see online, at-table and offline; non-friends see nothing", async () => {
    assert.equal((await friendList("B", { orm })).friends[0]?.status, "offline");
    await beat("A", false, { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.status, "online");
    await beat("A", true, { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.status, "at-table");
    await goOffline("A", { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.status, "offline");
    await requestFriend("C", "A", { orm });
    assert.equal((await friendList("A", { orm })).incoming[0]?.status, undefined);
  });

  it("an invite reaches only a friend, once, and goes stale", async () => {
    assert.equal(await inviteToTable("A", "C", "room1", { orm }), false);
    assert.deepEqual(await takeInvites("C", { orm }), []);
    assert.equal(await inviteToTable("A", "B", "room1", { orm }), true);
    assert.equal(await inviteToTable("A", "B", "room2", { orm }), true);
    assert.deepEqual(await takeInvites("B", { orm }), [{ fromName: "Ada", roomId: "room2" }]);
    assert.deepEqual(await takeInvites("B", { orm }), []);
    await inviteToTable("A", "B", "room3", { orm });
    await sql(`update table_invite set created_at = now() - interval '11 minutes'`);
    assert.deepEqual(await takeInvites("B", { orm }), []);
  });
});
