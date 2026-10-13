/**
 * orm.ts — the process's one ORM instance (STO-379, spec §6).
 *
 * Cached for the life of the process. An API route is a long-lived server process serving many
 * requests, and a per-request `MikroORM.init` would open (and leak) a connection pool per request.
 * `getOrm`/`closeOrm` are exported so a test can drive the same instance.
 */

import { MikroORM } from "@mikro-orm/postgresql";

import config, { pgConnectionString } from "../mikro-orm.config";

let orm: Promise<MikroORM> | undefined;

/** The process's one ORM instance, connected on first use. */
export function getOrm(url?: string): Promise<MikroORM> {
  orm ??= MikroORM.init(url ? {
    ...config, clientUrl: url, driverOptions: { connectionString: pgConnectionString(url) },
  } : config).catch((error) => {
    orm = undefined;
    throw error;
  });

  return orm;
}

/** Closes the process's ORM instance; safe to call when nothing was opened. */
export async function closeOrm(): Promise<void> {
  const pending = orm;
  orm = undefined;

  if (pending) {
    const instance = await pending;
    await instance.close(true);
  }
}
