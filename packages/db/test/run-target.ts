/**
 * run-target.ts — a throwaway database for one integration suite (STO-379, STO-346).
 *
 * The server named by `TEST_DATABASE_URL ?? DATABASE_URL` is never written to. Each suite creates
 * its own `wordpoker_test_<random>` database, migrates that, and drops it again in `after` - and
 * when the server refuses `create database` (a managed host may), it creates a run-scoped schema
 * instead and pins the connection's `search_path` to it. Both paths are torn down the same way.
 */

import { randomUUID } from "node:crypto";

import { MikroORM } from "@mikro-orm/postgresql";
import type { Client } from "pg";

import config, { pgConnectionString } from "../mikro-orm.config";

const rawServerUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export const serverUrl = rawServerUrl ? pgConnectionString(rawServerUrl) : undefined;

/** Where this run's tables live; `schema` is set only on the fallback path. */
export interface RunTarget {
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

export async function createRunTarget(client: Client, label: string): Promise<RunTarget> {
  if (!serverUrl) throw new Error("createRunTarget needs TEST_DATABASE_URL or DATABASE_URL");
  const database = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  try {
    await client.query(`create database "${database}"`);

    return {
      url: withDatabase(serverUrl, database),
      drop: async (admin) => {
        // `force` closes any connection this run left behind; the ORM is closed first, so this is
        // belt and braces rather than the mechanism (it needs a server new enough to have it).
        await admin.query(`drop database if exists "${database}" with (force)`);
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`${label}: create database refused (${reason}); using a run-scoped schema`);

    const schema = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await client.query(`create schema "${schema}"`);

    return {
      url: serverUrl,
      schema,
      drop: async (admin) => {
        await admin.query(`drop schema if exists "${schema}" cascade`);
      },
    };
  }
}

/**
 * The package's own config, with only its connection swapped for the run-scoped one: the entity
 * list, the migration path and its glob are exactly what `db:migrate` uses, so a suite fails if any
 * of them stops discovering a migration.
 */
export async function openRunOrm(target: RunTarget): Promise<MikroORM> {
  const orm = await MikroORM.init({
    ...config,
    clientUrl: target.url,
    driverOptions: {
      // pg parses the URL itself, so `sslmode` keeps its meaning; `options` is what pins the
      // fallback schema, and it is absent on the database path.
      connectionString: target.url,
      ...(target.schema ? { options: `-c search_path=${target.schema}` } : {}),
    },
  });
  // Better Auth creates this table before the package's isAnonymous migration in production.
  await orm.em.getConnection().execute(`create table "user" (id text primary key, name text not null)`);
  return orm;
}
