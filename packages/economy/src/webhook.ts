/**
 * webhook.ts — reading RevenueCat's webhook body (STO-346).
 *
 * Only `VIRTUAL_CURRENCY_TRANSACTION` is recorded: it is the event that says a purchase credited
 * coins, or a refund took them back. Any other event is read only far enough to answer 200.
 *
 * An `admin_api` event is a change our own server sent, already logged under its own kind by
 * `applyWalletChange`, so it is not recorded twice. A dashboard adjustment is still recorded.
 *
 * One event becomes at most one wallet_event row, since the row's `rc_event_id` is unique: the
 * event's `COIN` adjustments are summed (RevenueCat keys adjustments by currency, so in practice
 * there is one).
 */

import { COIN_CURRENCY, type WalletEventKind } from "@wordpoker/contracts";
import type { ReportedWalletEventInput } from "@wordpoker/db";

export const CURRENCY_EVENT_TYPE = "VIRTUAL_CURRENCY_TRANSACTION";

export interface ParsedWebhook {
  /** The event's `type`, whatever it is. */
  readonly type: string;
  /** The row to record: present only for a currency event that moved `COIN`. */
  readonly record: ReportedWalletEventInput | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coinAmount(adjustments: unknown): number | null {
  if (!Array.isArray(adjustments)) return null;
  let total: number | null = null;
  for (const adjustment of adjustments) {
    if (!isRecord(adjustment) || !isRecord(adjustment.currency)) continue;
    if (adjustment.currency.code !== COIN_CURRENCY || typeof adjustment.amount !== "number") continue;
    if (!Number.isInteger(adjustment.amount)) continue;
    total = (total ?? 0) + adjustment.amount;
  }

  return total;
}

function kindOf(source: unknown, amount: number): WalletEventKind {
  if (source === "in_app_purchase") return amount >= 0 ? "purchase" : "refund";

  return "adjustment";
}

/** Reads a webhook body; `null` when it is not a RevenueCat webhook at all. */
export function parseCurrencyEvent(body: unknown): ParsedWebhook | null {
  if (!isRecord(body) || !isRecord(body.event)) return null;
  const event = body.event;
  if (typeof event.type !== "string" || event.type.length === 0) return null;
  if (event.type !== CURRENCY_EVENT_TYPE) return { type: event.type, record: null };

  if (typeof event.id !== "string" || event.id.length === 0) return null;
  if (typeof event.app_user_id !== "string" || event.app_user_id.length === 0) return null;

  const amount = coinAmount(event.adjustments);
  if (amount === null || event.source === "admin_api") return { type: event.type, record: null };

  return {
    type: event.type,
    record: {
      userId: event.app_user_id,
      kind: kindOf(event.source, amount),
      amount,
      productId: typeof event.product_id === "string" ? event.product_id : null,
      rcEventId: event.id,
      rcTransactionId:
        typeof event.virtual_currency_transaction_id === "string" ? event.virtual_currency_transaction_id : null,
    },
  };
}
