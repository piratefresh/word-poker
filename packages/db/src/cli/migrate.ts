/**
 * migrate.ts — `pnpm --filter @wordpoker/db db:migrate` (STO-379, spec §6).
 *
 * Brings the database named by the environment up to the migrations in `src/migrations`, then
 * says what it did: how many it applied and how many are still pending is the difference between
 * "the table is there" and "the table already was there", which is what an operator actually
 * needs to read. A failure sets a non-zero exit code so a deploy step stops instead of serving a
 * schema the code does not match.
 */

import { MikroORM } from "@mikro-orm/postgresql";

import config from "../../mikro-orm.config";

async function main(): Promise<void> {
  const orm = await MikroORM.init(config);

  try {
    const migrator = orm.migrator;
    const applied = await migrator.up();
    const pending = await migrator.getPending();

    const names = applied.map((migration) => migration.name).join(", ");
    const summary = names || "none — schema already up to date";
    console.log(`db:migrate — applied ${applied.length} migration(s): ${summary}; ${pending.length} pending`);
  } finally {
    await orm.close(true);
  }
}

try {
  await main();
} catch (error) {
  console.error("db:migrate — failed:", error);
  process.exitCode = 1;
}
