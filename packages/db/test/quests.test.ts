/**
 * quests.test.ts — quest progress and the hand-report log against a real server (STO-525).
 *
 * Skipped with a message when the environment names no server, like `results-rating.test.ts` and
 * `wallet-event.test.ts`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import type { MikroORM } from "@mikro-orm/postgresql";
import { QUEST_IDS, type QuestId } from "@wordpoker/contracts";
import { Client } from "pg";

import {
  openWalletEvent,
  questProgress,
  recordQuestHand,
  streakDates,
  type QuestProgressEntry,
  type QuestProgressMap,
} from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

if (!serverUrl) {
  console.log("quests: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set");
}

const EMPTY_ENTRY: QuestProgressEntry = { progress: 0, streak: 0, done: false };

/** Every id defaulted to zero, with `overrides` applied — `apply` always returns a complete map. */
function fullMap(overrides: Partial<Record<QuestId, QuestProgressEntry>>): QuestProgressMap {
  const map = {} as QuestProgressMap;
  for (const id of QUEST_IDS) map[id] = overrides[id] ?? EMPTY_ENTRY;
  return map;
}

/** A no-op evaluator: whatever the caller passes back out, unchanged — isolates the db layer. */
function echo(result: { next: QuestProgressMap; completed: readonly QuestId[] }) {
  return () => result;
}

describe(
  "quests",
  { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL in the environment" },
  () => {
    let admin: Client;
    let target: RunTarget;
    let orm: MikroORM;

    before(async () => {
      admin = new Client({ connectionString: serverUrl });
      await admin.connect();
      target = await createRunTarget(admin, "quests");
      orm = await openRunOrm(target);
      await orm.migrator.up();
    });

    after(async () => {
      await orm?.close(true);
      await target?.drop(admin);
      await admin?.end();
    });

    it("runs apply once and upserts only the quests it changed", async () => {
      const userId = `user-${randomUUID()}`;
      const before = await questProgress(userId, { orm });
      assert.deepEqual(before, []);

      const result = await recordQuestHand(
        userId,
        `token-${randomUUID()}`,
        echo({
          next: fullMap({
            "win-word-2": { progress: 1, streak: 0, done: true },
            "hands-25": { progress: 1, streak: 0, done: false },
          }),
          completed: ["win-word-2"],
        }),
        { orm },
      );

      assert.deepEqual(result, { completed: ["win-word-2"], duplicate: false });

      const rows = await questProgress(userId, { orm });
      assert.equal(rows.length, 2);
      const byId = new Map(rows.map((row) => [row.questId, row]));
      assert.equal(byId.get("win-word-2")?.progress, 1);
      assert.ok(byId.get("win-word-2")?.completedAt instanceof Date);
      assert.equal(byId.get("hands-25")?.progress, 1);
      assert.equal(byId.get("hands-25")?.completedAt, null);
    });

    it("is a no-op for a repeated hand token, and never calls apply", async () => {
      const userId = `user-${randomUUID()}`;
      const token = `token-${randomUUID()}`;
      let calls = 0;
      const apply: Parameters<typeof recordQuestHand>[2] = (map) => {
        calls += 1;
        return { next: map, completed: [] };
      };

      const first = await recordQuestHand(userId, token, apply, { orm });
      assert.deepEqual(first, { completed: [], duplicate: false });
      assert.equal(calls, 1);

      const second = await recordQuestHand(userId, token, apply, { orm });
      assert.deepEqual(second, { completed: [], duplicate: true });
      assert.equal(calls, 1, "apply never runs for a duplicate token");
    });

    it("keeps a quest's completedAt once set, across a later run that leaves it done", async () => {
      const userId = `user-${randomUUID()}`;
      await recordQuestHand(
        userId,
        `token-${randomUUID()}`,
        echo({
          next: fullMap({ "win-word-2": { progress: 1, streak: 0, done: true } }),
          completed: ["win-word-2"],
        }),
        { orm },
      );
      const firstCompletedAt = (await questProgress(userId, { orm })).find((row) => row.questId === "win-word-2")
        ?.completedAt;
      assert.ok(firstCompletedAt);

      // A later hand that still reports the quest done (same shape) must not move its timestamp.
      await recordQuestHand(
        userId,
        `token-${randomUUID()}`,
        echo({
          next: fullMap({
            "win-word-2": { progress: 1, streak: 0, done: true },
            "hands-25": { progress: 1, streak: 0, done: false },
          }),
          completed: [],
        }),
        { orm },
      );
      const secondCompletedAt = (await questProgress(userId, { orm })).find((row) => row.questId === "win-word-2")
        ?.completedAt;
      assert.equal(secondCompletedAt?.getTime(), firstCompletedAt.getTime());
    });

    it("streakDates reads a player's streak wallet events, newest first, pending included", async () => {
      const userId = `user-${randomUUID()}`;
      await openWalletEvent({ userId, kind: "streak", amount: 50, ref: "2026-10-01" }, { orm });
      await openWalletEvent({ userId, kind: "streak", amount: 75, ref: "2026-10-02" }, { orm });
      await openWalletEvent({ userId, kind: "quest", amount: 100, ref: "win-word-2" }, { orm });

      assert.deepEqual(await streakDates(userId, { orm }), ["2026-10-02", "2026-10-01"]);
    });

    it("a second streak wallet event with the same ref opens no row, a different ref does", async () => {
      const userId = `user-${randomUUID()}`;
      const first = await openWalletEvent({ userId, kind: "streak", amount: 50, ref: "2026-10-01" }, { orm });
      const repeat = await openWalletEvent({ userId, kind: "streak", amount: 50, ref: "2026-10-01" }, { orm });
      const nextDay = await openWalletEvent({ userId, kind: "streak", amount: 75, ref: "2026-10-02" }, { orm });

      assert.ok(first);
      assert.equal(repeat, null);
      assert.ok(nextDay);
    });

    it("reverts the table on the migration's down path", async () => {
      await orm.migrator.down({ to: 0 });

      const [count] = await orm.em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count
           from information_schema.tables
          where table_schema = current_schema() and table_name in ('quest_progress', 'quest_hand_log')`,
      );

      assert.equal(Number(count?.count), 0, "both tables are gone after a rollback");
    });
  },
);
