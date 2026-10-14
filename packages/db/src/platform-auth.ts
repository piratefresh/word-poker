/**
 * platform-auth.ts — who owns a Game Center identity, which account a Play Games profile restores,
 * and the single-use begin → verify attempts between them (STO-593).
 *
 * Every writer takes the caller's `Sql`: one pooled pg connection inside `inTransaction`, because
 * Better Auth's account rows and these have to commit together. MikroORM's connection is a
 * different one, so nothing here uses it. Ownership is settled by unique indexes and row locks in
 * Postgres, never by in-process state, so it holds across API replicas.
 */

import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export type Sql = Pick<PoolClient, "query">;

/** Runs `run` in one transaction on one connection; any throw rolls the whole thing back. */
export async function inTransaction<T>(pool: Pool, run: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // A connection whose rollback failed may still hold the transaction: the pool discards it.
  let broken: Error | undefined;
  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch((rollbackError: unknown) => {
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

// ---------------------------------------------------------------------------------------------
// Attempts

export interface PlatformAuthAttempt {
  readonly intent: string;
  /** The session the attempt began under; null when it began signed out. */
  readonly sessionId: string | null;
  readonly userId: string | null;
}

/** A Game Center proof the same `proof_hash` already consumed. */
export class ProofReplayedError extends Error {
  constructor() {
    super("This proof was already used.");
  }
}

/**
 * Stores a new attempt (by its token's hash) for five minutes, and sweeps a bounded batch of old
 * ones. Swept rows outlive their attempt by ten minutes so a proof hash is kept until the proof's
 * own freshness window has closed.
 */
export async function openAttempt(
  sql: Sql,
  attempt: PlatformAuthAttempt & { readonly tokenHash: string; readonly provider: string },
): Promise<Date> {
  await sql.query(
    `delete from platform_auth_attempt where token_hash in (
       select token_hash from platform_auth_attempt where expires_at < now() - interval '10 minutes' limit 100
     )`,
  );
  const { rows } = await sql.query<{ expires_at: Date }>(
    `insert into platform_auth_attempt (token_hash, provider, intent, session_id, user_id, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '5 minutes') returning expires_at`,
    [attempt.tokenHash, attempt.provider, attempt.intent, attempt.sessionId, attempt.userId],
  );
  return rows[0]!.expires_at;
}

const ATTEMPT_COLUMNS = `intent, session_id as "sessionId", user_id as "userId"`;

/** The live (unconsumed, unexpired) attempt, read before any provider call is made. */
export async function peekAttempt(sql: Sql, tokenHash: string, provider: string): Promise<PlatformAuthAttempt | null> {
  const { rows } = await sql.query<PlatformAuthAttempt>(
    `select ${ATTEMPT_COLUMNS} from platform_auth_attempt
     where token_hash = $1 and provider = $2 and consumed_at is null and expires_at > now()`,
    [tokenHash, provider],
  );
  return rows[0] ?? null;
}

/**
 * Consumes the attempt — still live, still bound to `sessionId` — and, for Game Center, the proof.
 * Null when it expired, was used, or the session changed since `peekAttempt`. A proof another
 * attempt consumed throws `ProofReplayedError`; the transaction is then unusable and must roll back.
 */
export async function consumeAttempt(
  sql: Sql,
  tokenHash: string,
  provider: string,
  sessionId: string | null,
  proofHash: string | null = null,
): Promise<PlatformAuthAttempt | null> {
  try {
    const { rows } = await sql.query<PlatformAuthAttempt>(
      `update platform_auth_attempt set consumed_at = now(), proof_hash = $4
       where token_hash = $1 and provider = $2 and session_id is not distinct from $3
         and consumed_at is null and expires_at > now()
       returning ${ATTEMPT_COLUMNS}`,
      [tokenHash, provider, sessionId, proofHash],
    );
    return rows[0] ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new ProofReplayedError();
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Login identities (Better Auth's `account` table)

export async function providerOwner(sql: Sql, providerId: string, accountId: string): Promise<string | null> {
  const { rows } = await sql.query<{ userId: string }>(
    `select "userId" from "account" where "providerId" = $1 and "accountId" = $2`,
    [providerId, accountId],
  );
  return rows[0]?.userId ?? null;
}

/**
 * Creates a permanent account owned by a verified identity, with a hidden, unverified placeholder
 * email. When a racing request created one first, this one's user is removed again and the
 * winner's id comes back with `created: false` — one owner, no orphan.
 */
export async function createProviderUser(
  sql: Sql,
  { providerId, accountId, name }: { providerId: string; accountId: string; name: string },
): Promise<{ userId: string; created: boolean }> {
  const userId = randomUUID();
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified", "primaryIdentityVerified", "isAnonymous", "createdAt", "updatedAt")
     values ($1, $2, $3, false, true, false, now(), now())`,
    [userId, name, `${userId}@${providerId}.placeholder.invalid`],
  );
  const linked = await sql.query(
    `insert into "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, now(), now()) on conflict ("providerId", "accountId") do nothing`,
    [randomUUID(), accountId, providerId, userId],
  );
  if (linked.rowCount === 1) return { userId, created: true };

  await sql.query(`delete from "user" where id = $1`, [userId]);
  const owner = await providerOwner(sql, providerId, accountId);
  if (!owner) throw new Error(`${providerId} identity lost its owner mid-claim`);
  return { userId: owner, created: false };
}

/** Adds a verified identity to an account. `in-use` — and no change — when another account owns it. */
export async function linkProvider(sql: Sql, userId: string, providerId: string, accountId: string): Promise<"linked" | "in-use"> {
  await sql.query(
    `insert into "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, now(), now()) on conflict ("providerId", "accountId") do nothing`,
    [randomUUID(), accountId, providerId, userId],
  );
  if ((await providerOwner(sql, providerId, accountId)) !== userId) return "in-use";
  await sql.query(`update "user" set "primaryIdentityVerified" = true, "updatedAt" = now() where id = $1`, [userId]);
  return "linked";
}

/** The fields `isAccountEligible` reads, straight from the row; null when the account is gone. */
export async function accountStanding(
  sql: Sql,
  userId: string,
): Promise<{ isAnonymous: boolean; emailVerified: boolean; primaryIdentityVerified: boolean } | null> {
  const { rows } = await sql.query(
    `select coalesce("isAnonymous", false) as "isAnonymous", "emailVerified", "primaryIdentityVerified"
     from "user" where id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Play Games restore pointers

export interface RestorePointer {
  readonly userId: string;
  readonly version: number;
}

export async function restorePointer(sql: Sql, applicationId: string, playerId: string): Promise<RestorePointer | null> {
  const { rows } = await sql.query<RestorePointer>(
    `select user_id as "userId", version from pgs_account_restore where application_id = $1 and player_id = $2`,
    [applicationId, playerId],
  );
  return rows[0] ?? null;
}

/** Drops a pointer to an account that can no longer be restored — only the version that was read. */
export async function dropRestorePointer(sql: Sql, applicationId: string, playerId: string, version: number): Promise<void> {
  await sql.query(
    `delete from pgs_account_restore where application_id = $1 and player_id = $2 and version = $3`,
    [applicationId, playerId, version],
  );
}

/**
 * Points a profile at `userId`. A new or already-matching pointer succeeds. One pointing elsewhere
 * moves only when `expectedVersion` is the version the player confirmed replacing; otherwise the
 * current version comes back for the confirmation step, and nothing changes.
 */
export async function pointRestore(
  sql: Sql,
  { applicationId, playerId, userId, expectedVersion }: { applicationId: string; playerId: string; userId: string; expectedVersion?: number | undefined },
): Promise<{ associated: true } | { associated: false; version: number }> {
  const inserted = await sql.query(
    `insert into pgs_account_restore (application_id, player_id, user_id) values ($1, $2, $3) on conflict do nothing`,
    [applicationId, playerId, userId],
  );
  if (inserted.rowCount === 1) return { associated: true };

  const current = await restorePointer(sql, applicationId, playerId);
  if (!current) return pointRestore(sql, { applicationId, playerId, userId, expectedVersion });
  if (current.userId === userId) return { associated: true };
  if (expectedVersion !== current.version) return { associated: false, version: current.version };

  const swapped = await sql.query(
    `update pgs_account_restore set user_id = $3, version = version + 1, updated_at = now()
     where application_id = $1 and player_id = $2 and version = $4`,
    [applicationId, playerId, userId, expectedVersion],
  );
  if (swapped.rowCount === 1) return { associated: true };
  // Lost the swap: fine if the winner made the same replacement, otherwise confirm again.
  const latest = await restorePointer(sql, applicationId, playerId);
  if (latest?.userId === userId) return { associated: true };
  return { associated: false, version: latest?.version ?? current.version };
}
