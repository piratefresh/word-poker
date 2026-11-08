/**
 * ad-rewards.ts — the rewarded ads' daily cap (STO-1062).
 *
 * RevenueCat verifies each view through AdMob SSV and grants the coins itself, so this module never
 * pays one. It counts the grants the webhook logged as `ad_reward` rows and, past
 * `AD_REWARD_DAILY_CAP` in a UTC day, takes the grant back. The count lives in the database, so an
 * app reinstall cannot reset it; the client only hides the button sooner.
 */

import { AD_REWARD_DAILY_CAP } from "@wordpoker/contracts";
import { adRewardsSince as adRewardsSinceDb, type ReportedWalletEventInput } from "@wordpoker/db";

import { applyWalletChange, type WalletChangeResult, type WalletDeps } from "./wallet";

export interface AdRewardDeps extends WalletDeps {
  readonly adRewardsSince?: (userId: string, since: Date) => Promise<number>;
}

/** Midnight UTC at the start of `now`'s day. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function countSince(deps: AdRewardDeps) {
  return deps.adRewardsSince ?? ((userId: string, since: Date) => adRewardsSinceDb(userId, since));
}

/** How many more rewarded ads the player can be paid for today. */
export async function adRewardsLeft(userId: string, now: Date = new Date(), deps: AdRewardDeps = {}): Promise<number> {
  const used = await countSince(deps)(userId, startOfUtcDay(now));

  return Math.max(0, AD_REWARD_DAILY_CAP - used);
}

/**
 * Called after the webhook logs a new `ad_reward` grant. Over the cap, takes it back under the
 * event's id (a redelivered event is never logged twice, so never taken back twice). Resolves with
 * the take-back's result, or `null` when the grant was within the cap. A player who already spent
 * the coins ends `insufficient_coins`: the excess is small and bounded, so it is let go.
 */
export async function enforceAdRewardCap(
  grant: ReportedWalletEventInput,
  now: Date = new Date(),
  deps: AdRewardDeps = {},
): Promise<WalletChangeResult | null> {
  if (grant.kind !== "ad_reward" || grant.amount <= 0) return null;
  const used = await countSince(deps)(grant.userId, startOfUtcDay(now));
  if (used <= AD_REWARD_DAILY_CAP) return null;

  return applyWalletChange(grant.userId, "ad_reward", -grant.amount, { ref: grant.rcEventId }, deps);
}
