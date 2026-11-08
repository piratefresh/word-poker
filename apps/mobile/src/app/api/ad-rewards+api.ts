/**
 * ad-rewards+api.ts — how many rewarded ads the signed-in player can still be paid for today (STO-1062).
 *
 * RevenueCat grants the coins; this only reads the server's count, so the button's "N left today"
 * survives a reinstall. Same gate as the other coin earners: an eligible (verified) account.
 */

import { isAccountEligible, type AdRewardsResponse } from "@wordpoker/contracts";
import { adRewardsLeft } from "@wordpoker/economy";

import { auth } from "@/auth/server/auth";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `200` `{ left }`, `401` without a session, `403` unverified, `500` when the count can't be read. */
export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to watch ads for coins." }, 401);
  if (!isAccountEligible(session.user)) return json({ error: "Verify your email to earn coins." }, 403);

  try {
    const body: AdRewardsResponse = { left: await adRewardsLeft(session.user.id) };

    return json(body, 200);
  } catch (error) {
    console.error(`[ad-rewards] ${session.user.id}: could not count today's ads:`, error);

    return json({ error: "Couldn't check your ads for today." }, 500);
  }
}
