/**
 * orm.ts — the process's ORM instances (STO-379, spec §6).
 *
 * One instance per database URL, cached for the life of the process. An API route is a
 * long-lived server process serving many requests, and a per-request `MikroORM.init` would open
 * (and leak) a connection pool per request; the room server's history writes (STO-455) reach a
 * database their own env names, which gets its own instance of the same cache. `getOrm`/
 * `closeOrm` are exported so a test can drive the same instances.
 */

import { MikroORM } from "@mikro-orm/postgresql";

import config, { pgConnectionString } from "../mikro-orm.config";

const orms = new Map<string, Promise<MikroORM>>();

/** The process's ORM instance for `url`; the configured connection's own when omitted. */
export function getOrm(url?: string): Promise<MikroORM> {
  const key = url ?? process.env.DATABASE_URL ?? "";
  let orm = orms.get(key);

  if (orm === undefined) {
    orm =
      url === undefined
        ? MikroORM.init(config)
        : // The same override the db tests use: `clientUrl` alone loses the query string, so
          // `pg` gets the URL itself and keeps `sslmode`'s meaning.
          MikroORM.init({
            ...config,
            clientUrl: url,
            driverOptions: { connectionString: pgConnectionString(url) },
          });
    orms.set(key, orm);
  }

  return orm;
}

/** Closes the process's ORM instances; safe to call when nothing was opened. */
export async function closeOrm(): Promise<void> {
  const pending = [...orms.values()];
  orms.clear();

  for (const promise of pending) {
    const instance = await promise;
    await instance.close(true);
  }
}
