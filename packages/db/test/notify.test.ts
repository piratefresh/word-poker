import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { deletePushToken, notifyUsers, savePushToken } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

interface Sent { to: string }

describe("notifyUsers", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  const sql = (text: string, args: unknown[] = []) => orm.em.getConnection().execute<{ token: string }[]>(text, args);
  let sent: Sent[][];
  /** A fake Expo endpoint: records each request and marks the tokens in `dead` as unregistered. */
  const fakeFetch = (dead: string[] = []): typeof fetch => async (_url, init) => {
    const batch = JSON.parse(String(init?.body)) as Sent[];
    sent.push(batch);
    return Response.json({ data: batch.map((m) => (dead.includes(m.to) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) });
  };
  const message = { title: "Hi", body: "There", url: "wordpoker://online/r1" };

  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "notify");
    orm = await openRunOrm(target);
    await orm.migrator.up();
    await sql(`insert into "user" (id, name) values ('A','Ada'), ('B','Bea')`);
  });
  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });
  beforeEach(async () => {
    sent = [];
    await sql(`delete from push_token`);
    await sql(`update "user" set "notifyTableInvite" = true, "notifyFriendRequest" = true, "notifyFriendOnline" = false`);
  });

  it("defaults: invites and requests on, friend-online off", async () => {
    await savePushToken("A", "ExponentPushToken[a]", { orm });
    await notifyUsers(["A"], "friendOnline", message, { orm, fetch: fakeFetch() });
    assert.equal(sent.length, 0);
    await notifyUsers(["A"], "tableInvite", message, { orm, fetch: fakeFetch() });
    await notifyUsers(["A"], "friendRequest", message, { orm, fetch: fakeFetch() });
    assert.equal(sent.length, 2);
  });

  it("a kind switched off sends nothing", async () => {
    await savePushToken("A", "ExponentPushToken[a]", { orm });
    await sql(`update "user" set "notifyTableInvite" = false where id = 'A'`);
    await notifyUsers(["A", "B"], "tableInvite", message, { orm, fetch: fakeFetch() });
    assert.equal(sent.length, 0);
  });

  it("sends in chunks of 100", async () => {
    for (let i = 0; i < 205; i++) await savePushToken("A", `ExponentPushToken[${i}]`, { orm });
    await notifyUsers(["A"], "tableInvite", message, { orm, fetch: fakeFetch() });
    assert.deepEqual(sent.map((batch) => batch.length), [100, 100, 5]);
  });

  it("drops tokens Expo reports unregistered", async () => {
    await savePushToken("A", "ExponentPushToken[dead]", { orm });
    await savePushToken("A", "ExponentPushToken[live]", { orm });
    await notifyUsers(["A"], "tableInvite", message, { orm, fetch: fakeFetch(["ExponentPushToken[dead]"]) });
    assert.deepEqual((await sql(`select token from push_token`)).map((r) => r.token), ["ExponentPushToken[live]"]);
  });

  it("a token moves to the account that registers it last, and only its owner can delete it", async () => {
    await savePushToken("A", "ExponentPushToken[x]", { orm });
    await savePushToken("B", "ExponentPushToken[x]", { orm });
    await deletePushToken("A", "ExponentPushToken[x]", { orm });
    assert.equal((await sql(`select token from push_token where user_id = 'B'`)).length, 1);
    await notifyUsers(["A"], "tableInvite", message, { orm, fetch: fakeFetch() });
    assert.equal(sent.length, 0);
  });

  it("never throws when the push service fails", async () => {
    await savePushToken("A", "ExponentPushToken[a]", { orm });
    const original = console.error;
    console.error = () => {};
    try {
      await notifyUsers(["A"], "tableInvite", message, { orm, fetch: async () => { throw new Error("down"); } });
    } finally {
      console.error = original;
    }
  });
});
