/**
 * vip.test.ts — VIP Points storage against a real server (STO-1170).
 *
 * Skipped with a message when the environment names no server, like `quests.test.ts`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";

import { recordVipPoints, setVipTierPaid, vipProgress } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

if (!serverUrl) {
  console.log("vip: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set");
}

const DAY = "2026-11-25";
const NEXT = "2026-11-26";

describe("vip", { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL in the environment" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;

  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "vip");
    orm = await openRunOrm(target);
    await orm.migrator.up();
  });

  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });

  it("reads zeros for a new player", async () => {
    assert.deepEqual(await vipProgress(`user-${randomUUID()}`, DAY, { orm }), { points: 0, tierPaid: 0, playToday: 0 });
  });

  it("adds points once per token and never re-runs apply", async () => {
    const userId = `user-${randomUUID()}`;
    let calls = 0;
    const apply = ({ playToday }: { points: number; playToday: number }) => {
      calls += 1;
      return { added: 25, playToday: playToday + 10 };
    };

    const first = await recordVipPoints(userId, "hand-1", DAY, apply, { orm });
    assert.equal(first.duplicate, false);
    assert.equal(first.points, 25);

    const again = await recordVipPoints(userId, "hand-1", DAY, apply, { orm });
    assert.equal(again.duplicate, true);
    assert.equal(again.points, 25);
    assert.equal(calls, 1);
    assert.deepEqual(await vipProgress(userId, DAY, { orm }), { points: 25, tierPaid: 0, playToday: 10 });
  });

  it("rolls the play counter over on a new UTC day", async () => {
    const userId = `user-${randomUUID()}`;
    const seen: number[] = [];
    const apply = ({ playToday }: { points: number; playToday: number }) => {
      seen.push(playToday);
      return { added: 10, playToday: playToday + 10 };
    };

    await recordVipPoints(userId, "a", DAY, apply, { orm });
    await recordVipPoints(userId, "b", DAY, apply, { orm });
    await recordVipPoints(userId, "c", NEXT, apply, { orm });

    assert.deepEqual(seen, [0, 10, 0]);
    assert.equal((await vipProgress(userId, NEXT, { orm })).playToday, 10);
    assert.equal((await vipProgress(userId, DAY, { orm })).playToday, 0);
  });

  it("only moves the tier high-water mark forwards", async () => {
    const userId = `user-${randomUUID()}`;
    await setVipTierPaid(userId, 3, { orm });
    await setVipTierPaid(userId, 1, { orm });
    assert.equal((await vipProgress(userId, DAY, { orm })).tierPaid, 3);
  });
});
