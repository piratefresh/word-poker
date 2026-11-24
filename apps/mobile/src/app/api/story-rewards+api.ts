/**
 * story-rewards+api.ts — a Story chapter's first-clear coins and XP (STO-976).
 *
 * Conventions of `quests+api.ts`: the session comes from Better Auth, earning coins needs an
 * eligible (verified) account, and a RevenueCat failure leaves the row `pending` for
 * `GET /api/wallet`'s retry rather than failing the claim. The body names a chapter and nothing
 * else; `claimStoryReward` reads the amount from the chapter config and holds the guards (one
 * payout per chapter, in chapter order).
 */

import { isAccountEligible, isStoryRewardClaim, type StoryRewardRefusal } from "@wordpoker/contracts";
import { claimStoryReward } from "@wordpoker/economy";

import { auth } from "@/auth/server/auth";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REFUSALS: Record<StoryRewardRefusal, { status: number; error: string }> = {
  unknown_chapter: { status: 404, error: "There is no such chapter." },
  out_of_order: { status: 409, error: "Clear the chapter before this one first." },
};

/**
 * `200` the claim's result (a repeat claim is `duplicate: true`), `400` a malformed body, `401`
 * without a session, `403` unverified, `404` an unknown chapter, `409` the previous chapter unpaid.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to earn coins." }, 401);
  if (!isAccountEligible(session.user)) return json({ error: "Verify your email to earn coins." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "That claim could not be read." }, 400);
  }
  if (!isStoryRewardClaim(body)) return json({ error: "That claim could not be read." }, 400);

  try {
    const outcome = await claimStoryReward(session.user.id, body.chapterId);
    if (!outcome.ok) {
      const refusal = REFUSALS[outcome.reason];

      return json({ error: refusal.error }, refusal.status);
    }

    return json(outcome.response, 200);
  } catch (error) {
    console.error(`[story-rewards] ${session.user.id}: could not pay ${body.chapterId}:`, error);

    return json({ error: "The reward could not be saved." }, 502);
  }
}
