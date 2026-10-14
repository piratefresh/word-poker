/**
 * wallet+api.ts — the signed-in player's coin balance (STO-346).
 *
 * The balance is RevenueCat Virtual Currency `COIN`; this route reads it with the server's secret
 * key, so every platform (web included) reads the Wallet the same way. Before reading, it re-sends
 * the player's `pending` wallet changes — a welcome grant RevenueCat missed lands here.
 */

import { isAccountEligible, type WalletResponse } from "@wordpoker/contracts";
import { hasWelcomeEvent } from "@wordpoker/db";
import { getCoinBalance, retryPending } from "@wordpoker/economy";

import { auth } from "@/auth/server/auth";
import { grantEligibleRewards } from "@/auth/server/auth-verification";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `200 { coins, welcomed }`, `401` without a session, `502` when RevenueCat cannot be read. */
export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.isAnonymous) return json({ error: "Sign in to see your coins." }, 401);

  const userId = session.user.id;

  // A welcome grant that was never recorded (a failed guest-hand count, a crash before the row) is
  // retried here; recorded-but-pending ones go out in `retryPending` below.
  if (isAccountEligible(session.user) && !(await hasWelcomeEvent(userId).catch(() => true))) {
    await grantEligibleRewards(session.user);
  }

  try {
    await retryPending(userId);
  } catch (error) {
    // A retry that fails is tried again next time; the balance is still worth reading.
    console.error(`[wallet] ${userId}: could not retry pending changes:`, error);
  }

  try {
    const [coins, welcomed] = await Promise.all([getCoinBalance(userId), hasWelcomeEvent(userId)]);
    const body: WalletResponse = { coins, welcomed };

    return json(body, 200);
  } catch (error) {
    console.error(`[wallet] ${userId}: could not read the balance:`, error);

    return json({ error: "The coin store could not be reached." }, 502);
  }
}
