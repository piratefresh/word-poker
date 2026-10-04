/**
 * wallet-event.ts — the writers for the Wallet's audit log (STO-346).
 *
 * The inserts that may collide with a unique index are raw `insert … on conflict do nothing
 * returning *`: a collision returns no row instead of raising. Catching a unique violation would
 * not be safe here — inside a transaction Postgres aborts everything after it.
 */

import type { MikroORM } from "@mikro-orm/postgresql";
import type { WalletEventKind } from "@wordpoker/contracts";

import type { WalletEventStatus } from "./entities/index";
import { getOrm } from "./orm";

/** One logged change, in the shape callers read it. */
export interface WalletEventRecord {
  readonly id: string;
  readonly createdAt: Date;
  readonly userId: string;
  readonly kind: WalletEventKind;
  readonly amount: number;
  readonly status: WalletEventStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly balanceAfter: number | null;
  readonly productId: string | null;
  readonly ref: string | null;
}

export interface OpenWalletEventInput {
  readonly userId: string;
  readonly kind: WalletEventKind;
  readonly amount: number;
  readonly productId?: string;
  readonly ref?: string;
}

export interface SettleWalletEventInput {
  readonly status: WalletEventStatus;
  readonly balanceAfter?: number;
  readonly lastError?: string;
}

export interface ReportedWalletEventInput {
  readonly userId: string;
  readonly kind: WalletEventKind;
  readonly amount: number;
  readonly productId: string | null;
  readonly rcEventId: string;
  readonly rcTransactionId: string | null;
}

interface WalletEventSqlRow {
  id: string;
  created_at: Date | string;
  user_id: string;
  kind: WalletEventKind;
  amount: number;
  status: WalletEventStatus;
  attempts: number;
  last_error: string | null;
  balance_after: number | null;
  product_id: string | null;
  ref: string | null;
}

type DbOptions = { orm?: MikroORM };

function toRecord(row: WalletEventSqlRow): WalletEventRecord {
  return {
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    userId: row.user_id,
    kind: row.kind,
    amount: row.amount,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    balanceAfter: row.balance_after,
    productId: row.product_id,
    ref: row.ref,
  };
}

async function connection(options: DbOptions) {
  const instance = options.orm ?? (await getOrm());

  return instance.em.getConnection();
}

/**
 * Opens a `pending` row for a change our server is about to make, or resolves with `null` when a
 * unique index already holds one (a second welcome grant).
 */
export async function openWalletEvent(
  input: OpenWalletEventInput,
  options: DbOptions = {},
): Promise<WalletEventRecord | null> {
  const db = await connection(options);
  const [row] = await db.execute<WalletEventSqlRow[]>(
    `insert into "wallet_event" ("user_id", "kind", "amount", "status", "product_id", "ref")
     values (?, ?, ?, 'pending', ?, ?)
     on conflict do nothing
     returning *`,
    [input.userId, input.kind, input.amount, input.productId ?? null, input.ref ?? null],
  );

  return row ? toRecord(row) : null;
}

/** Records the outcome of one attempt at a row's RevenueCat call; every attempt counts. */
export async function settleWalletEvent(
  id: string,
  input: SettleWalletEventInput,
  options: DbOptions = {},
): Promise<void> {
  const db = await connection(options);
  await db.execute(
    `update "wallet_event"
        set "status" = ?, "balance_after" = coalesce(?, "balance_after"), "last_error" = ?,
            "attempts" = "attempts" + 1, "updated_at" = now()
      where "id" = ?`,
    [input.status, input.balanceAfter ?? null, input.lastError ?? null, id],
  );
}

/** A player's rows still waiting on RevenueCat, oldest first. */
export async function pendingWalletEvents(
  userId: string,
  options: DbOptions = {},
): Promise<WalletEventRecord[]> {
  const db = await connection(options);
  const rows = await db.execute<WalletEventSqlRow[]>(
    `select * from "wallet_event"
      where "user_id" = ? and "status" = 'pending'
      order by "created_at", "id"`,
    [userId],
  );

  return rows.map(toRecord);
}

/**
 * Logs a change RevenueCat made itself (a purchase or a refund), as `applied`. Resolves `false`
 * when the webhook event was already recorded — RevenueCat redelivers until it sees a 200.
 */
export async function recordReportedEvent(
  input: ReportedWalletEventInput,
  options: DbOptions = {},
): Promise<boolean> {
  const db = await connection(options);
  const rows = await db.execute<{ id: string }[]>(
    `insert into "wallet_event"
       ("user_id", "kind", "amount", "status", "product_id", "rc_event_id", "rc_transaction_id")
     values (?, ?, ?, 'applied', ?, ?, ?)
     on conflict do nothing
     returning "id"`,
    [input.userId, input.kind, input.amount, input.productId, input.rcEventId, input.rcTransactionId],
  );

  return rows.length > 0;
}
