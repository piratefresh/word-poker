/**
 * story-reward.ts — claims a Story chapter's first-clear coins and XP (STO-976).
 *
 * `POST /api/story-rewards` pays each chapter once, in chapter order, with the amounts from the
 * chapter config; a repeat claim is safe and answers `duplicate: true`. A refusal the caller can
 * act on (no such chapter, or the chapter before it was never claimed) resolves; anything else (a
 * 401, a 403, a failed Wallet) rejects with the same errors the quest claim uses.
 *
 * The save lives on the device, so a boss can be beaten signed out or offline. `settleStoryRewards`
 * is what the app calls: on a first clear, and again each time the map opens, until every beaten
 * chapter is paid (STO-1129).
 */

import { isStoryRewardResponse, type StoryRewardRefusal, type StoryRewardResponse } from "@wordpoker/contracts";
import { STORY_CHAPTERS, chapterRecord, type StoryProgress } from "@wordpoker/game-rules";

import { apiBaseURL } from "@/lib/network/api-base-url";
import { questFailure, sessionInit, WalletAuthError, WalletUnverifiedError } from "@/lib/wallet/wallet-client";

export type StoryRewardResult =
  | { readonly ok: true; readonly response: StoryRewardResponse }
  | { readonly ok: false; readonly reason: StoryRewardRefusal };

const REFUSAL_STATUS: Readonly<Record<number, StoryRewardRefusal>> = { 404: "unknown_chapter", 409: "out_of_order" };

export async function claimStoryReward(chapterId: string): Promise<StoryRewardResult> {
  const init = await sessionInit();
  const response = await fetch(`${apiBaseURL}/api/story-rewards`, {
    ...init,
    method: "POST",
    headers: { ...init.headers, "content-type": "application/json" },
    body: JSON.stringify({ chapterId }),
  });
  if (response.status === 401) throw new WalletAuthError();

  const refusal = REFUSAL_STATUS[response.status];
  if (refusal) return { ok: false, reason: refusal };
  if (!response.ok) throw await questFailure(response);

  const body: unknown = await response.json();
  if (!isStoryRewardResponse(body)) throw new Error("The reward's result could not be read.");

  return { ok: true, response: body };
}

/** Where a beaten chapter's reward stands: in the Wallet, waiting on a verified sign-in, or to be tried again. */
export type StoryPayout = "paid" | "sign-in" | "later";

/** Claims the server has answered this launch, by player: the map asks again only for the rest. */
const settled = new Set<string>();

/**
 * Claims the reward of every chapter the save has beaten, in chapter order (the route pays in no
 * other), skipping those already answered for this player. Never rejects.
 *
 * @returns `status` for the save as a whole, and `fresh` when a claim paid for the first time.
 */
export async function settleStoryRewards(save: StoryProgress, userId: string | undefined): Promise<{ status: StoryPayout; fresh: boolean }> {
  if (userId === undefined) return { status: "sign-in", fresh: false };
  let fresh = false;
  try {
    for (const chapter of STORY_CHAPTERS) {
      // Chapters open in order, so nothing past the first unbeaten boss is beaten either.
      if (!chapterRecord(save, chapter.id).bossCleared) break;
      const key = `${userId}|${chapter.id}`;
      if (settled.has(key)) continue;
      const result = await claimStoryReward(chapter.id);
      if (!result.ok) return { status: "later", fresh };
      settled.add(key);
      fresh ||= !result.response.duplicate;
    }
    return { status: "paid", fresh };
  } catch (error) {
    const signIn = error instanceof WalletAuthError || error instanceof WalletUnverifiedError;
    return { status: signIn ? "sign-in" : "later", fresh };
  }
}
