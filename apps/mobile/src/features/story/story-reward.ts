/**
 * story-reward.ts — claims a Story chapter's first-clear coins and XP (STO-976).
 *
 * `POST /api/story-rewards` pays each chapter once, in chapter order, with the amounts from the
 * chapter config; a repeat claim is safe and answers `duplicate: true`. A refusal the caller can
 * act on (no such chapter, or the chapter before it was never claimed) resolves; anything else (a
 * 401, a 403, a failed Wallet) rejects with the same errors the quest claim uses.
 */

import { isStoryRewardResponse, type StoryRewardRefusal, type StoryRewardResponse } from "@wordpoker/contracts";

import { apiBaseURL } from "@/lib/network/api-base-url";
import { questFailure, sessionInit, WalletAuthError } from "@/lib/wallet/wallet-client";

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
