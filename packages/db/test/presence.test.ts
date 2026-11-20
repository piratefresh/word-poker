import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { acceptFriend, beat, friendList, goOffline, inviteToTable, isOnline, nudge, requestFriend, takeInvites } from "../src/index";
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
    await sql(`delete from nudge`);
    await sql(`update "user" set image = null`);
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
  it("an at-table friend carries their table; the street and going offline clear it", async () => {
    await beat("A", "room1", { orm });
    assert.deepEqual((await friendList("B", { orm })).friends[0], { userId: "A", name: "Ada", status: "at-table", roomId: "room1" });
    await beat("A", true, { orm });
    assert.deepEqual((await friendList("B", { orm })).friends[0], { userId: "A", name: "Ada", status: "at-table" });
    await beat("A", "room1", { orm });
    await beat("A", false, { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.roomId, undefined);
    await beat("A", "room1", { orm });
    await goOffline("A", { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.roomId, undefined);
  });

  it("an offline friend shows when they were last seen, up to 30 days back", async () => {
    assert.equal((await friendList("B", { orm })).friends[0]?.lastSeen, undefined);
    await beat("A", false, { orm });
    assert.equal((await friendList("B", { orm })).friends[0]?.lastSeen, undefined, "online friends need no last seen");
    await goOffline("A", { orm });
    const seen = (await friendList("B", { orm })).friends[0]?.lastSeen;
    assert.ok(seen && Math.abs(Date.parse(seen) - Date.now()) < 60_000, `goOffline keeps the last beat (${seen})`);
    await sql(`update presence set last_seen_at = now() - interval '31 days'`);
    assert.equal((await friendList("B", { orm })).friends[0]?.lastSeen, undefined);
  });

  it("friends and requests carry their avatar photo when they have one", async () => {
    await sql(`update "user" set image = 'https://avatars.test/a.jpg' where id = 'A'`);
    await requestFriend("C", "B", { orm });
    await sql(`update "user" set image = 'https://avatars.test/c.jpg' where id = 'C'`);
    const page = await friendList("B", { orm });
    assert.equal(page.friends[0]?.image, "https://avatars.test/a.jpg");
    assert.equal(page.incoming[0]?.image, "https://avatars.test/c.jpg");
    assert.equal((await friendList("A", { orm })).friends[0]?.image, undefined);
  });

  it("a nudge reaches only a friend, once per cooldown, per sender", async () => {
    assert.equal(await nudge("A", "C", { orm }), "not-friends");
    assert.equal(await nudge("A", "A", { orm }), "not-friends");
    assert.equal(await nudge("A", "B", { orm }), "sent");
    assert.equal(await nudge("A", "B", { orm }), "too-soon");
    assert.equal(await nudge("B", "A", { orm }), "sent", "each direction has its own cooldown");
    await sql(`update nudge set sent_at = now() - interval '5 hours'`);
    assert.equal(await nudge("A", "B", { orm }), "sent");
    const [a, b] = await Promise.all([nudge("B", "A", { orm }), nudge("B", "A", { orm })]);
    assert.deepEqual([a, b].sort(), ["sent", "too-soon"], "two quick taps send one");
  });
});
