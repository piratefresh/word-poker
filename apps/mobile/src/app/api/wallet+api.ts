/**
 * wallet+api.ts — the signed-in player's coin balance (STO-346).
 *
 * The balance is RevenueCat Virtual Currency `COIN`; this route reads it with the server's secret
 * key, so every platform (web included) reads the Wallet the same way. Before reading, it re-sends
 * the player's `pending` wallet changes — a welcome grant RevenueCat missed lands here.
 */

import type { WalletResponse } from "@wordpoker/contracts";
import { getCoinBalance, retryPending } from "@wordpoker/economy";

import { auth } from "@/auth/server/auth";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `200 { coins }`, `401` without a session, `502` when RevenueCat cannot be read. */
export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to see your coins." }, 401);

  const userId = session.user.id;

  try {
    await retryPending(userId);
  } catch (error) {
    // A retry that fails is tried again next time; the balance is still worth reading.
    console.error(`[wallet] ${userId}: could not retry pending changes:`, error);
  }

  try {
    const body: WalletResponse = { coins: await getCoinBalance(userId) };

    return json(body, 200);
  } catch (error) {
    console.error(`[wallet] ${userId}: could not read the balance:`, error);

    return json({ error: "The coin store could not be reached." }, 502);
  }
}
