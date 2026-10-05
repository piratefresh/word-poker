/**
 * Seed (or repair) the shared E2E test user in the app's Postgres database.
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
 * the identity with TEST_USER_EMAIL / TEST_USER_PASSWORD / TEST_USER_NAME.
 */

import { generateRandomString, hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

const EMAIL = process.env.TEST_USER_EMAIL ?? "e2e@wordpoker.dev";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "wordpoker-e2e";
const NAME = process.env.TEST_USER_NAME ?? "E2E Test";

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

  const existing = await client.query(`SELECT id FROM "user" WHERE email = $1`, [EMAIL]);
  const userId = existing.rows[0]?.id ?? generateRandomString(32);
  const passwordHash = await hashPassword(PASSWORD);
  const now = new Date();

  await client.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, $4, $4)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"`,
    [userId, NAME, EMAIL, now],
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

  await client.query("COMMIT");
  console.log(`Seeded test user: ${EMAIL} / ${PASSWORD}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
