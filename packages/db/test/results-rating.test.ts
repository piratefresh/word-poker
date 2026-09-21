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
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";

import config from "../mikro-orm.config";
import { ResultsRating } from "../src/entities/index";
import { saveResultsRating } from "../src/index";

const serverUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!serverUrl) {
  console.log(
    "results-rating: skipped — neither TEST_DATABASE_URL nor DATABASE_URL is set, so there is no server to create a run-scoped database on",
  );
}

/** Where this run's tables live; `schema` is set only on the fallback path. */
interface RunTarget {
  readonly url: string;
  readonly schema?: string;
  drop(client: Client): Promise<void>;
}

/** The same URL pointed at another database, so nothing this run does can reach the real one. */
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;

  return parsed.toString();
}

async function createRunTarget(client: Client): Promise<RunTarget> {
  const database = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  try {
    await client.query(`create database "${database}"`);

    return {
      url: withDatabase(serverUrl!, database),
      drop: async (admin) => {
        // `force` closes any connection this run left behind; the ORM is closed first, so this is
        // belt and braces rather than the mechanism (it needs a server new enough to have it).
        await admin.query(`drop database if exists "${database}" with (force)`);
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`results-rating: create database refused (${reason}); using a run-scoped schema`);

    const schema = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await client.query(`create schema "${schema}"`);

    return {
      url: serverUrl!,
      schema,
      drop: async (admin) => {
        await admin.query(`drop schema if exists "${schema}" cascade`);
      },
    };
  }
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

      target = await createRunTarget(admin);

      // The package's own config, with only its connection swapped for the run-scoped one: the
      // entity list, the migration path and its glob are exactly what `db:migrate` uses, so this
      // test fails if any of them stops discovering the migration.
      orm = await MikroORM.init({
        ...config,
        clientUrl: target.url,
        driverOptions: {
          // pg parses the URL itself, so `sslmode` keeps its meaning; `options` is what pins the
          // fallback schema, and it is absent on the database path.
          connectionString: target.url,
          ...(target.schema ? { options: `-c search_path=${target.schema}` } : {}),
        },
      });

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
      await orm.migrator.down();

      const [count] = await orm.em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count
           from information_schema.tables
          where table_schema = current_schema() and table_name = 'results_rating'`,
      );

      assert.equal(Number(count?.count), 0, "the table is gone after a rollback");
      assert.deepEqual(
        (await orm.migrator.getPending()).map((migration) => migration.name),
        ["Migration20260921030429_results_rating"],
        "the migration is pending again",
      );
    });
  },
);
