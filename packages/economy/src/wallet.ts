/**
 * wallet.ts — the one path for every change our server makes to a Wallet (STO-346).
 *
 * Each change is logged before it is sent: a `pending` wallet_event row opens first, its id goes to
 * RevenueCat as the `Idempotency-Key`, and the row settles on the answer. A row that never heard
 * back stays `pending` and is re-sent under the same key by `retryPending`, so a lost response can
 * never pay twice.
 *
 * RevenueCat does not document how long it keeps an idempotency key. If it turns out to be short,
 * a retry must compare the balance against the row before re-sending — before buy-ins rely on this.
 */

import { WELCOME_GRANT, type WalletEventKind } from "@wordpoker/contracts";
import {
  openWalletEvent,
  pendingWalletEvents,
  settleWalletEvent,
  type OpenWalletEventInput,
  type SettleWalletEventInput,
  type WalletEventRecord,
} from "@wordpoker/db";

import {
  EconomyNotConfiguredError,
  InsufficientCoinsError,
  RevenueCatError,
  revenueCat,
  type RevenueCatClient,
} from "./revenuecat";

/** The wallet_event writers this module needs; the database's by default, a fake in tests. */
export interface WalletStore {
  openWalletEvent(input: OpenWalletEventInput): Promise<WalletEventRecord | null>;
  settleWalletEvent(id: string, input: SettleWalletEventInput): Promise<void>;
  pendingWalletEvents(userId: string): Promise<WalletEventRecord[]>;
}

export interface WalletDeps {
  readonly client?: RevenueCatClient;
  readonly store?: WalletStore;
}

const databaseStore: WalletStore = {
  openWalletEvent: (input) => openWalletEvent(input),
  settleWalletEvent: (id, input) => settleWalletEvent(id, input),
  pendingWalletEvents: (userId) => pendingWalletEvents(userId),
};

export type WalletChangeResult =
  | { readonly applied: true; readonly balance: number }
  /**
   * `already_recorded`: a unique index held the row (a second welcome). `insufficient_coins`:
   * RevenueCat refused the spend and the row is `failed`. `rejected`: RevenueCat refused the row's
   * idempotency key (never retryable), and the row is `failed`. `pending`: RevenueCat could not be
   * reached or is not configured, and the row waits for a retry.
   */
  | {
      readonly applied: false;
      readonly reason: "already_recorded" | "insufficient_coins" | "rejected" | "pending";
    };

export interface WalletChangeExtras {
  readonly productId?: string;
  readonly ref?: string;
}

/** A short code for `last_error`: never a response body. */
function errorCode(error: unknown): string {
  if (error instanceof EconomyNotConfiguredError) return "not_configured";
  if (error instanceof RevenueCatError) {
    if (error.status === 0) return "network";
    return error.type ? `http_${error.status}_${error.type}` : `http_${error.status}`;
  }

  return "unexpected";
}

/** Sends one row to RevenueCat and settles it on the answer. */
async function send(row: WalletEventRecord, deps: WalletDeps): Promise<WalletChangeResult> {
  const store = deps.store ?? databaseStore;

  try {
    const client = deps.client ?? revenueCat();
    const balance = await client.adjustCoins(row.userId, row.amount, row.id);
    await store.settleWalletEvent(row.id, { status: "applied", balanceAfter: balance });

    return { applied: true, balance };
  } catch (error) {
    if (error instanceof InsufficientCoinsError) {
      await store.settleWalletEvent(row.id, { status: "failed", lastError: errorCode(error) });

      return { applied: false, reason: "insufficient_coins" };
    }
    if (error instanceof RevenueCatError && error.type === "idempotency_error") {
      await store.settleWalletEvent(row.id, { status: "failed", lastError: errorCode(error) });

      return { applied: false, reason: "rejected" };
    }

    await store.settleWalletEvent(row.id, { status: "pending", lastError: errorCode(error) });

    return { applied: false, reason: "pending" };
  }
}

/** Logs and applies one change to a player's Wallet. A database failure is thrown, not swallowed. */
export async function applyWalletChange(
  userId: string,
  kind: WalletEventKind,
  amount: number,
  extras: WalletChangeExtras = {},
  deps: WalletDeps = {},
): Promise<WalletChangeResult> {
  const store = deps.store ?? databaseStore;
  const row = await store.openWalletEvent({ userId, kind, amount, ...extras });
  if (!row) return { applied: false, reason: "already_recorded" };

  return send(row, deps);
}

/** A player's balance, read from RevenueCat. */
export function getCoinBalance(userId: string, deps: Pick<WalletDeps, "client"> = {}): Promise<number> {
  return (deps.client ?? revenueCat()).getCoinBalance(userId);
}

/** The once-per-player welcome grant, paid when the player verifies their email. */
export function grantWelcome(userId: string, deps: WalletDeps = {}): Promise<WalletChangeResult> {
  return applyWalletChange(userId, "welcome", WELCOME_GRANT, {}, deps);
}

/**
 * Re-sends a player's `pending` rows, oldest first, each under its own id. Stops at the first row
 * that is still unreachable, so changes keep their order. Resolves with how many applied.
 */
export async function retryPending(userId: string, deps: WalletDeps = {}): Promise<number> {
  const store = deps.store ?? databaseStore;
  let applied = 0;

  for (const row of await store.pendingWalletEvents(userId)) {
    const result = await send(row, deps);
    if (result.applied) applied += 1;
    else if (result.reason === "pending") break;
  }

  return applied;
}
