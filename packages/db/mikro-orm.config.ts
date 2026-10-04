/**
 * mikro-orm.config.ts — how this package reaches Postgres, and where its migrations live
 * (STO-379, spec §6).
 *
 * The connection comes from the environment, first hit wins:
 *   1. `DATABASE_URL` — the name `packages/db/.env.example` and `apps/mobile/.env` both set.
 *   2. The five `DATABASE_*` names `apps/mobile/src/lib/auth.ts` builds its own pool from.
 *   3. The `DB_*` names this package's scaffold started from.
 *
 * Importing this file never throws: an unconfigured process still has to be able to read the
 * config (the integration test decides for itself whether a server is reachable), so an empty
 * environment falls through to the scaffold's local defaults rather than failing here.
 */

import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";

import { ResultsRating, WalletEvent } from "./src/entities/index";

/**
 * libpq reads `sslrootcert=system` as "trust the system's CAs", but `pg` reads every `sslrootcert`
 * as a file path and fails to open one called `system`. Without the parameter `pg` verifies against
 * Node's own CA store, which is the same intent, so it is dropped and `sslmode` is kept.
 */
export function pgConnectionString(url: string): string {
  return url.replace(/([?&])sslrootcert=system(&|$)/, (_, lead: string, tail: string) => (tail ? lead : ""));
}

function connection() {
  const url = process.env.DATABASE_URL;

  if (url) {
    // `clientUrl` on its own is not enough. MikroORM splits it into host/port/user/password and
    // drops the query string, and with it the `sslmode` the managed host insists on; handing the
    // same string to `pg` keeps libpq's meaning (`sslmode=verify-full`, `sslrootcert`, ...).
    return { clientUrl: url, driverOptions: { connectionString: pgConnectionString(url) } };
  }

  const host = process.env.DATABASE_HOST;
  const dbName = process.env.DATABASE_NAME;

  if (host && dbName) {
    return {
      host,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER ?? "",
      password: process.env.DATABASE_PASSWORD ?? "",
      dbName,
      // These discrete names point at the managed host, which speaks TLS only — the same bare
      // `ssl: true` the app's own pool uses. A local server is reached through `DATABASE_URL`.
      driverOptions: { ssl: true },
    };
  }

  return {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "admin",
    password: process.env.DB_PASS ?? "password",
    dbName: process.env.DB_NAME ?? "movie_db",
  };
}

export default defineConfig({
  entities: [ResultsRating, WalletEvent],
  extensions: [Migrator],
  // Resolved from this file rather than `process.cwd()`: `pnpm --filter` runs the script from the
  // package, but a stray `node packages/db/src/cli/migrate.ts` from the workspace root would
  // otherwise look for `./src/migrations` there and quietly find nothing.
  baseDir: import.meta.dirname,
  migrations: {
    path: "./src/migrations",
    pathTs: "./src/migrations",
    // Deliberately not the default `!(*.d).{js,ts}`. Both glob engines this can run under (node's
    // own and tinyglobby) apply the `!(...)` extglob only when it is the entire pattern, so
    // `!(*.d).Migration*.ts` matches nothing. The directory holds one `Migration<timestamp>_<name>.ts`
    // per change plus a barrel, and the barrel has to stay out of the glob: the migrator
    // instantiates the first export that is a function and would run the barrel as a migration.
    glob: "Migration*.{js,ts}",
    // No snapshot files: every migration here is written by hand (there is one table, and its
    // SQL says what it does), and a snapshot is named after the database it was taken from — so
    // keeping them meant committing one file per environment, and the test runs' throwaway
    // databases each leaving one behind. A generated migration can turn this back on.
    snapshot: false,
  },
  ...connection(),
});
