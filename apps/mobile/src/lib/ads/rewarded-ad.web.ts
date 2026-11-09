/**
 * rewarded-ad.web.ts — the web build has no ads; the buttons that offer one stay hidden.
 */

import type { AdPlacement } from "@wordpoker/contracts";

export type AdOutcome = "rewarded" | "dismissed" | "failed";

export function rewardedAdsAvailable(): boolean {
  return false;
}

export function adPrivacyOptionsRequired(): Promise<boolean> {
  return Promise.resolve(false);
}

export function showAdPrivacyOptions(): Promise<void> {
  return Promise.resolve();
}

export function loadRewardedAd(_placement: AdPlacement): Promise<never> {
  return Promise.reject(new Error("No ads on the web."));
}

export function showRewardedAd(_ad: never): Promise<AdOutcome> {
  return Promise.resolve("failed");
}
