/**
 * results-rating.test.ts — what the rating table has to be true of, against a real server
 * (STO-379, spec §6).
 *
 * Run by the package's own runner (`node --import tsx --test "test/**\/*.test.ts"`), and skipped
 * with a message when the environment names no server: a unit test cannot tell whether
 * `gen_random_uuid()` exists, whether `text[]` round-trips, or whether the migration's `down`
 * really removes the table.
 *
 * The server named by `TEST_DATABASE_URL ?? DATABASE_URL` is never written to. Each run creates
 * its own `wordpoker_test_<random>` database, migrates that, and drops it again in `after` - and
 * when the server refuses `create database` (a managed host may), it creates a run-scoped schema
 * instead and pins the connection's `search_path` to it. Both paths are torn down the same way.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";

import { ResultsRating } from "../src/entities/index";
import { saveResultsRating } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

if (!serverUrl) {
  console.log(
    "results-rating: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set, so there is no server to create a run-scoped database on",
  );
}

describe(
  "results_rating",
  { skip: !serverUrl && "no TEST_DATABASE_URL or DATABASE_URL in the environment" },
  () => {
    let admin: Client;
    let target: RunTarget;
    let orm: MikroORM;

    before(async () => {
      admin = new Client({ connectionString: serverUrl });
      await admin.connect();

      target = await createRunTarget(admin, "results-rating");
      orm = await openRunOrm(target);

      await orm.migrator.up();
    });

    after(async () => {
      await orm?.close(true);
      await target?.drop(admin);
      await admin?.end();
    });

    it("creates the table the entity declares", async () => {
      const columns = await orm.em.getConnection().execute<{ column_name: string; data_type: string; is_nullable: string }[]>(
        `select column_name, data_type, is_nullable
           from information_schema.columns
          where table_schema = current_schema() and table_name = 'results_rating'
          order by ordinal_position`,
      );

      assert.deepEqual(
        columns.map((column) => [column.column_name, column.data_type, column.is_nullable]),
        [
          ["id", "uuid", "NO"],
          ["created_at", "timestamp with time zone", "NO"],
          ["hand_no", "integer", "NO"],
          ["seed", "bigint", "NO"],
          ["rating", "smallint", "YES"],
          ["tags", "ARRAY", "NO"],
          ["note", "text", "YES"],
        ],
      );
    });

    it("stores a rating and reads every column back", async () => {
      const seed = 2 ** 40 + 1;
      const id = await saveResultsRating(
        { handNo: 18, seed, rating: 4, tags: ["Pacing", "Bug"], note: "the deal stuttered" },
        { orm },
      );

      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      const [row] = await orm.em.getConnection().execute<
        {
          hand_no: number;
          seed: string;
          rating: number | null;
          tags: string[];
          note: string | null;
          created_at: string;
        }[]
      >(`select hand_no, seed, rating, tags, note, created_at from results_rating where id = ?`, [id]);

      assert.ok(row, "the row the save returned an id for is in the table");
      assert.equal(row.hand_no, 18);
      // The column is `bigint`, but the seed is a JS number and has to come back as one.
      assert.equal(Number(row.seed), seed);
      assert.equal(row.rating, 4);
      assert.deepEqual(row.tags, ["Pacing", "Bug"]);
      assert.equal(row.note, "the deal stuttered");
      // Raw SQL leaves a timestamptz as text; the entity mapping is what turns it into a Date,
      // which the next test asserts.
      assert.ok(
        Number.isFinite(Date.parse(row.created_at)),
        `created_at carries a real timestamp: ${row.created_at}`,
      );
    });

    it("maps the row onto the entity, including the null rating and the empty tags", async () => {
      const id = await saveResultsRating({ handNo: 3, seed: 7, rating: null, tags: [], note: "" }, { orm });

      const stored = await orm.em.fork().findOneOrFail(ResultsRating, { id });

      assert.equal(stored.handNo, 3);
      assert.equal(stored.seed, 7);
      assert.equal(stored.rating, null);
      assert.deepEqual(stored.tags, []);
      assert.equal(stored.note, "");
      assert.ok(stored.createdAt instanceof Date, "datetime maps onto a JS Date");
    });

    it("reverts the table on the migration's down path", async () => {
      // Every migration, not just the last: later tables sit on top of this one.
      await orm.migrator.down({ to: 0 });

      const [count] = await orm.em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count
           from information_schema.tables
          where table_schema = current_schema() and table_name = 'results_rating'`,
      );

      assert.equal(Number(count?.count), 0, "the table is gone after a rollback");
      assert.deepEqual(
        (await orm.migrator.getPending()).map((migration) => migration.name),
        [
          "Migration20260921030429_results_rating",
          "Migration20261004120000_wallet_event",
          "Migration20261005120000_quests",
          "Migration20261006120000_xp_levels",
          "Migration20261012120000_game_history",
          "Migration20261013120000_anonymous_user",
          "Migration20261013130000_hand_seat_adopted_from",
          "Migration20261013140000_friends",
          "Migration20261014120000_referral",
        ],
        "the migrations are pending again",
      );
    });
  },
);
