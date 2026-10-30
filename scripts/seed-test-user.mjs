/**
 * Seed (or repair) the E2E test users in the app's Postgres database.
 *
 * The auth tables are owned by Better Auth (see apps/mobile/src/auth/server/auth.ts); this
 * script writes the same rows its email/password provider would, hashing with
 * Better Auth's own `hashPassword` so the app verifies the password unchanged.
 * Rerunning is safe and is the way to reset a forgotten test password: an
 * existing user keeps its id (and any sessions) and just gets the known
 * password and name back.
 *
 * Usage (from the repo root):
 *   node --env-file=apps/mobile/.env scripts/seed-test-user.mjs
 *
 * `--env-file` supplies DATABASE_* exactly as the API route reads them; a shell
 * that already exports those variables works too (process env wins). Override
 * one identity with TEST_USER_EMAIL / TEST_USER_NAME, the shared password with TEST_USER_PASSWORD.
 *
 * It also seeds the wallet personas in `test-personas.json` (zero, broke, short, rich, unverified)
 * under the same password. Those with a `coins` figure are written email-verified, so the app reads
 * their Wallet; `apps/server/scripts/seed-wallets.ts` then sets that Wallet to the figure.
 * `pnpm seed:test-users` runs both.
 */

import { readFileSync } from "node:fs";

import { generateRandomString, hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

const PASSWORD = process.env.TEST_USER_PASSWORD ?? "wordpoker-e2e";
// A table seats an account once, so multi-seat smokes sign in as e2e, e2e-2, e2e-3 and e2e-4.
const USERS = process.env.TEST_USER_EMAIL
  ? [{ email: process.env.TEST_USER_EMAIL, name: process.env.TEST_USER_NAME ?? "E2E Test" }]
  : [1, 2, 3, 4].map((n) => n === 1
    ? { email: "e2e@wordpoker.dev", name: "E2E Test" }
    : { email: `e2e-${n}@wordpoker.dev`, name: `E2E Test ${n}` })
    .concat(
      JSON.parse(readFileSync(new URL("./test-personas.json", import.meta.url), "utf8"))
        .map(({ email, name, coins }) => ({ email, name, verified: coins !== null })),
    );

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name} (load apps/mobile/.env)`);
  return value;
}

const pool = new Pool({
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: required("DATABASE_USER"),
  password: required("DATABASE_PASSWORD"),
  database: required("DATABASE_NAME"),
  ssl: true,
});

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const passwordHash = await hashPassword(PASSWORD);
  // `verified` unset (the E2E users) keeps whatever the row already says.
  for (const { email, name, verified = null } of USERS) {
    const existing = await client.query(`SELECT id FROM "user" WHERE email = $1`, [email]);
    const userId = existing.rows[0]?.id ?? generateRandomString(32);
    const now = new Date();

    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, COALESCE($5::boolean, false), $4, $4)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt",
             "emailVerified" = COALESCE($5::boolean, "user"."emailVerified")`,
      [userId, name, email, now, verified],
    );

    // One credential account per user, keyed by the user's id (Better Auth's
    // shape). The table only enforces a primary key on id, so the upsert is
    // select-then-write rather than ON CONFLICT.
    const account = await client.query(
      `SELECT id FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
      [userId],
    );

    if (account.rows[0]) {
      await client.query(
        `UPDATE account SET password = $1, "updatedAt" = $2 WHERE id = $3`,
        [passwordHash, now, account.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $1, 'credential', $1, $2, $3, $3)`,
        [userId, passwordHash, now],
      );
    }
  }

  await client.query("COMMIT");
  console.log(`Seeded test users: ${USERS.map((user) => user.email).join(", ")} / ${PASSWORD}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
