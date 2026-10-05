/**
 * revenuecat-webhook+api.ts — RevenueCat's report of a purchase or a refund (STO-346).
 *
 * A purchase credits the Wallet on RevenueCat's side; this route only logs it in wallet_event.
 * RevenueCat sends the dashboard's "Authorization header value" in `Authorization`, and redelivers
 * until it sees a 200 — so a database failure answers 500, and a redelivered event records once.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { recordReportedEvent } from "@wordpoker/db";
import { parseCurrencyEvent } from "@wordpoker/economy";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Compares digests, so neither the length nor the content of the secret leaks through timing. */
function authorized(header: string | null, secret: string): boolean {
  if (header === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();

  return timingSafeEqual(digest(header), digest(secret));
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret) return json({ error: "The webhook is not configured." }, 503);

  if (!authorized(request.headers.get("authorization"), secret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const parsed = parseCurrencyEvent(body);
  if (!parsed) return json({ error: "Body is not a RevenueCat webhook" }, 400);
  if (!parsed.record) return json({ received: true }, 200);

  try {
    const recorded = await recordReportedEvent(parsed.record);

    return json({ received: true, recorded }, 200);
  } catch (error) {
    console.error("[revenuecat-webhook] could not record the event:", error);

    return json({ error: "Could not record the event" }, 500);
  }
}
