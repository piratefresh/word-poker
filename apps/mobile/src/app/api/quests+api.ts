/**
 * quests+api.ts — the signed-in, verified player's quests, login streak, and XP level (STO-525, STO-543).
 *
 * Conventions of `wallet+api.ts`: the session comes from Better Auth, a RevenueCat failure is
 * logged and never thrown (the row stays `pending`, the next `GET` resolves it), and nothing here
 * re-judges a hand — `claimQuestHand` dedupes by `handToken` and `@wordpoker/game-rules`' pure
 * evaluator judges the *claimed* facts. The client authors those facts (shape-validated in
 * contracts, not corroborated), so XP and quest farming by a verified account is an accepted
 * risk (STO-543: "we'd rather people play"); there is no rate limit. Earning coins needs a verified email, the same gate the welcome
 * grant uses: a throwaway account should not be able to farm a streak.
 */

import { isQuestHandClaim, type QuestClaimResponse, type QuestStateResponse } from "@wordpoker/contracts";
import { playerProgress, questProgress } from "@wordpoker/db";
import { claimQuestHand, creditDailyStreak, payCompletedQuests } from "@wordpoker/economy";
import { QUEST_CATALOG, levelForXp } from "@wordpoker/game-rules";

import { auth } from "@/auth/server/auth";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UNVERIFIED = { error: "Verify your email to earn coins." };

/** `200` the player's streak and quest state, `401` without a session, `403` unverified. */
export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to see your quests." }, 401);
  if (!session.user.emailVerified) return json(UNVERIFIED, 403);

  const userId = session.user.id;

  let streak: QuestStateResponse["streak"] = { current: 0, creditedToday: null };
  try {
    streak = await creditDailyStreak(userId);
  } catch (error) {
    // The streak is still worth reading even when today's credit could not be recorded.
    console.error(`[quests] ${userId}: could not credit the daily streak:`, error);
  }

  try {
    await payCompletedQuests(userId);
  } catch (error) {
    // Heals a crash between a progress commit and its wallet call; a failed heal just retries next time.
    console.error(`[quests] ${userId}: could not pay completed quests:`, error);
  }

  try {
    const rows = await questProgress(userId);
    const progress = await playerProgress(userId);
    const byId = new Map(rows.map((row) => [row.questId, row]));
    const body: QuestStateResponse = {
      streak,
      xp: progress.xp,
      level: levelForXp(progress.xp).level,
      quests: QUEST_CATALOG.map((def) => ({
        id: def.id,
        progress: byId.get(def.id)?.progress ?? 0,
        done: byId.get(def.id)?.completedAt != null,
      })),
    };

    return json(body, 200);
  } catch (error) {
    console.error(`[quests] ${userId}: could not read progress:`, error);

    return json({ error: "Quests could not be read." }, 502);
  }
}

/** `200` what the claim completed, `400` a malformed claim, `401`/`403` the same as `GET`. */
export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to earn coins." }, 401);
  if (!session.user.emailVerified) return json(UNVERIFIED, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "That claim could not be read." }, 400);
  }
  if (!isQuestHandClaim(body)) return json({ error: "That claim could not be read." }, 400);

  try {
    const result: QuestClaimResponse = await claimQuestHand(session.user.id, body);

    return json(result, 200);
  } catch (error) {
    console.error(`[quests] ${session.user.id}: could not record the hand:`, error);

    return json({ error: "The claim could not be saved." }, 502);
  }
}
