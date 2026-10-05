/**
 * wallet-event.ts — one change to a player's Wallet, as the database logs it (STO-346).
 *
 * The balance itself is not here: RevenueCat Virtual Currency `COIN` holds it. This row is the
 * audit trail — every change our server asks RevenueCat to make (welcome grant, later buy-ins and
 * cash-outs), and every purchase or refund RevenueCat reports through its webhook.
 *
 * A server-made row's `id` is also the `Idempotency-Key` sent with its RevenueCat call, so a retry
 * of a `pending` row cannot apply twice. Two partial unique indexes in the migration carry the
 * once-only rules: one `welcome` per user, and one row per webhook event id.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

/** Where a row stands: sent and confirmed, refused for good, or waiting to be retried. */
export const WALLET_EVENT_STATUSES = ["pending", "applied", "failed"] as const;

export type WalletEventStatus = (typeof WALLET_EVENT_STATUSES)[number];

export const WalletEvent = defineEntity({
  name: "WalletEvent",
  tableName: "wallet_event",
  properties: () => ({
    id: p.uuid().primary().defaultRaw("gen_random_uuid()").onCreate(() => randomUUID()),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
    /** Better Auth's user id, which is also the RevenueCat app user id. */
    userId: p.text(),
    /** One of contracts' `WALLET_EVENT_KINDS`. */
    kind: p.text(),
    /** Signed: a grant is positive, a spend negative. */
    amount: p.integer(),
    /** One of `WALLET_EVENT_STATUSES`. */
    status: p.text(),
    attempts: p.integer().default(0),
    /** A short code for the last failure — never a response body. */
    lastError: p.text().nullable(),
    /** The balance RevenueCat returned once the change applied. */
    balanceAfter: p.integer().nullable(),
    productId: p.text().nullable(),
    /** The room or session of a buy-in/cash-out, or a quest id. */
    ref: p.text().nullable(),
    /** The webhook event id of a reported row. */
    rcEventId: p.text().nullable(),
    /** RevenueCat's `virtual_currency_transaction_id` of a reported row. */
    rcTransactionId: p.text().nullable(),
  }),
});

/** The stored row, as `em.find` hands it back. */
export type WalletEventRow = InferEntity<typeof WalletEvent>;
