/**
 * tile-sets.test.ts — tile set purchases and the equipped set against a real server (STO-1045).
 *
 * Skipped with a message when the environment names no server, like `quests.test.ts`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";

import {
  equippedTileSet,
  openWalletEvent,
  playerProgress,
  setEquippedTileSet,
  settleWalletEvent,
  tileSetPurchases,
} from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

if (!serverUrl) {
  console.log("tile-sets: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set");
}

describe(
  "tile sets",
  { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL in the environment" },
  () => {
    let admin: Client;
    let target: RunTarget;
    let orm: MikroORM;

    before(async () => {
      admin = new Client({ connectionString: serverUrl });
      await admin.connect();
      target = await createRunTarget(admin, "tile_sets");
      orm = await openRunOrm(target);
      await orm.migrator.up();
    });

    after(async () => {
      await orm?.close(true);
      await target?.drop(admin);
      await admin?.end();
    });

    it("opens one live purchase per set, and another once the first failed", async () => {
      const userId = `user-${randomUUID()}`;
      const buy = () => openWalletEvent({ userId, kind: "tile_set", amount: -4000, ref: "midnight" }, { orm });

      const first = await buy();
      assert.ok(first);
      assert.equal(await buy(), null, "a pending purchase holds the index");
      assert.deepEqual(await tileSetPurchases(userId, { orm }), { midnight: "pending" });

      await settleWalletEvent(first.id, { status: "failed", lastError: "http_422" }, { orm });
      assert.deepEqual(await tileSetPurchases(userId, { orm }), {}, "a failed purchase owns nothing");

      const second = await buy();
      assert.ok(second, "a failed purchase leaves the index, so the player can try again");
      await settleWalletEvent(second.id, { status: "applied", balanceAfter: 4775 }, { orm });
      assert.deepEqual(await tileSetPurchases(userId, { orm }), { midnight: "applied" });
      assert.equal(await buy(), null, "an applied purchase is never charged twice");
    });

    it("keeps each player's and each set's purchases apart", async () => {
      const a = `user-${randomUUID()}`;
      const b = `user-${randomUUID()}`;
      assert.ok(await openWalletEvent({ userId: a, kind: "tile_set", amount: -2500, ref: "jade" }, { orm }));
      assert.ok(await openWalletEvent({ userId: a, kind: "tile_set", amount: -3000, ref: "rosewood" }, { orm }));
      assert.ok(await openWalletEvent({ userId: b, kind: "tile_set", amount: -2500, ref: "jade" }, { orm }));
      assert.deepEqual(Object.keys(await tileSetPurchases(a, { orm })).sort(), ["jade", "rosewood"]);
      assert.deepEqual(Object.keys(await tileSetPurchases(b, { orm })), ["jade"]);
    });

    it("stores the equipped set beside the player's XP, null until one is set", async () => {
      const userId = `user-${randomUUID()}`;
      assert.equal(await equippedTileSet(userId, { orm }), null);

      await setEquippedTileSet(userId, "jade", { orm });
      assert.equal(await equippedTileSet(userId, { orm }), "jade");
      assert.deepEqual(await playerProgress(userId, { orm }), { xp: 0, levelPaid: 1 }, "creates the row with defaults");

      await setEquippedTileSet(userId, "ivory", { orm });
      assert.equal(await equippedTileSet(userId, { orm }), "ivory");
    });
  },
);
