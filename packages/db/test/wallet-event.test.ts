/**
 * wallet-event.test.ts — the Wallet's audit log against a real server (STO-346).
 *
 * The once-only rules live in partial unique indexes, so only a real Postgres can say whether a
 * second welcome grant really opens nothing and a redelivered webhook really records once.
 * Skipped with a message when the environment names no server, like `results-rating.test.ts`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";

import {
  openWalletEvent,
  pendingWalletEvents,
  recordReportedEvent,
  settleWalletEvent,
} from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

if (!serverUrl) {
  console.log("wallet-event: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set");
}

describe(
  "wallet_event",
  { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL in the environment" },
  () => {
    let admin: Client;
    let target: RunTarget;
    let orm: MikroORM;

    before(async () => {
      admin = new Client({ connectionString: serverUrl });
      await admin.connect();
      target = await createRunTarget(admin, "wallet-event");
      orm = await openRunOrm(target);
      await orm.migrator.up();
    });

    after(async () => {
      await orm?.close(true);
      await target?.drop(admin);
      await admin?.end();
    });

    it("opens one welcome per user and nothing for the second", async () => {
      const userId = `user-${randomUUID()}`;

      const first = await openWalletEvent({ userId, kind: "welcome", amount: 5000 }, { orm });
      const second = await openWalletEvent({ userId, kind: "welcome", amount: 5000 }, { orm });

      assert.ok(first, "the first welcome opens a row");
      assert.equal(first.status, "pending");
      assert.equal(first.attempts, 0);
      assert.equal(first.amount, 5000);
      assert.equal(second, null, "the welcome index holds the second");

      const other = await openWalletEvent({ userId: `user-${randomUUID()}`, kind: "welcome", amount: 5000 }, { orm });
      assert.ok(other, "another user still gets theirs");
    });

    it("lets a user hold several rows of any other kind", async () => {
      const userId = `user-${randomUUID()}`;

      const a = await openWalletEvent({ userId, kind: "buy_in", amount: -500, ref: "room-a" }, { orm });
      const b = await openWalletEvent({ userId, kind: "buy_in", amount: -500, ref: "room-b" }, { orm });

      assert.ok(a && b);
      assert.notEqual(a.id, b.id);
      assert.equal(a.ref, "room-a");
    });

    it("records a webhook event once", async () => {
      const userId = `user-${randomUUID()}`;
      const event = {
        userId,
        kind: "purchase" as const,
        amount: 2000,
        productId: "coins_small",
        rcEventId: `evt-${randomUUID()}`,
        rcTransactionId: "vctx-1",
      };

      assert.equal(await recordReportedEvent(event, { orm }), true);
      assert.equal(await recordReportedEvent(event, { orm }), false);

      const [count] = await orm.em
        .getConnection()
        .execute<{ count: string; status: string }[]>(
          `select count(*) as count, min(status) as status from wallet_event where rc_event_id = ?`,
          [event.rcEventId],
        );
      assert.equal(Number(count?.count), 1);
      assert.equal(count?.status, "applied");
    });

    it("hands pending rows back oldest first, and settles them", async () => {
      const userId = `user-${randomUUID()}`;
      const first = await openWalletEvent({ userId, kind: "welcome", amount: 5000 }, { orm });
      const second = await openWalletEvent({ userId, kind: "adjustment", amount: 100 }, { orm });
      assert.ok(first && second);

      assert.deepEqual(
        (await pendingWalletEvents(userId, { orm })).map((row) => row.id),
        [first.id, second.id],
      );

      await settleWalletEvent(first.id, { status: "pending", lastError: "http_503" }, { orm });
      await settleWalletEvent(first.id, { status: "applied", balanceAfter: 5000 }, { orm });

      const pending = await pendingWalletEvents(userId, { orm });
      assert.deepEqual(
        pending.map((row) => row.id),
        [second.id],
      );

      const [row] = await orm.em
        .getConnection()
        .execute<{ status: string; attempts: number; balance_after: number | null; last_error: string | null }[]>(
          `select status, attempts, balance_after, last_error from wallet_event where id = ?`,
          [first.id],
        );
      assert.deepEqual(row, { status: "applied", attempts: 2, balance_after: 5000, last_error: null });
    });

    it("reverts the table on the migration's down path", async () => {
      await orm.migrator.down();

      const [count] = await orm.em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count
           from information_schema.tables
          where table_schema = current_schema() and table_name = 'wallet_event'`,
      );

      assert.equal(Number(count?.count), 0, "the table is gone after a rollback");
    });
  },
);
