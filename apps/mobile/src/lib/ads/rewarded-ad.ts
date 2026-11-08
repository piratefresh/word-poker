/**
 * rewarded-ad.ts — the only module that touches `react-native-google-mobile-ads` (STO-1060, STO-1063).
 *
 * Every ad goes through RevenueCat's AdMob adapter, so its events land in RevenueCat's Ad Charts
 * under its placement, and `enableRewardVerification` lets RevenueCat grant the coins after AdMob's
 * server-side verification. The client never credits a coin. The web build gets
 * `rewarded-ad.web.ts`, which has no ads.
 *
 * A debug build loads Google's test unit. Test units have no server-side verification, so a test ad
 * plays end to end but always ends `failed`. To test a real grant, use a release build, or a debug
 * build on a device registered as an AdMob test device with the real unit.
 */

import { Platform } from "react-native";
import mobileAds, { AdEventType, RewardedAdEventType, TestIds, type RewardedAd } from "react-native-google-mobile-ads";
import { RevenueCatAdMob } from "react-native-purchases-admob";

import type { AdPlacement } from "@wordpoker/contracts";

import { configureRevenueCat, revenuecatAvailable } from "@/lib/wallet/revenuecat";

/** `rewarded_free_coins` in AdMob. */
const ANDROID_REWARDED_UNIT = "ca-app-pub-4407207030015431/4364831894";

function unitId(): string | null {
  if (__DEV__) return TestIds.REWARDED;
  if (Platform.OS === "android") return ANDROID_REWARDED_UNIT;
  // ponytail: iOS ad unit (and app.json's iosAppId, a Google sample for now) pending from AdMob.
  return null;
}

/** Whether this build can show rewarded ads: the store SDK is set up and the platform has a unit. */
export function rewardedAdsAvailable(): boolean {
  return revenuecatAvailable() && unitId() !== null;
}

let initialized: Promise<unknown> | null = null;

/** RevenueCat first, then Mobile Ads: the adapter only tracks while Purchases is configured. */
function initAds(): Promise<unknown> {
  configureRevenueCat();
  initialized ??= mobileAds().initialize();

  return initialized;
}

/**
 * A loaded ad for one placement. Verification tokens are single-use, so each view needs a new
 * one: load the next after showing this one.
 */
export async function loadRewardedAd(placement: AdPlacement): Promise<RewardedAd> {
  const unit = unitId();
  if (!unit) throw new Error("No rewarded ads on this platform yet.");
  await initAds();
  const ad = await RevenueCatAdMob.createRewardedAd(unit, { placement, enableRewardVerification: true });

  return new Promise((resolve, reject) => {
    const offLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      offLoaded();
      offError();
      resolve(ad);
    });
    const offError = ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
      offLoaded();
      offError();
      reject(error instanceof Error ? error : new Error("The ad did not load."));
    });
    ad.load();
  });
}

/** `rewarded`: RevenueCat verified the full view and granted the coins. `dismissed`: closed early. */
export type AdOutcome = "rewarded" | "dismissed" | "failed";

/** Shows a loaded ad and resolves once it has closed and, if earned, been verified. */
export function showRewardedAd(ad: RewardedAd): Promise<AdOutcome> {
  return new Promise((resolve) => {
    let earned = false;
    let settled = false;
    const offs: (() => void)[] = [];
    const done = (outcome: AdOutcome) => {
      if (settled) return;
      settled = true;
      for (const off of offs) off();
      resolve(outcome);
    };

    // Verification completes only after a reward is earned, so a close without one is the early exit.
    offs.push(ad.addAdEventListener(AdEventType.CLOSED, () => !earned && done("dismissed")));
    offs.push(ad.addAdEventListener(AdEventType.ERROR, () => done("failed")));

    RevenueCatAdMob.showWithRewardVerification(ad, {
      onUserEarnedReward: () => {
        earned = true;
      },
      onRewardVerificationCompleted: (result) => {
        const coins = [result.reward, ...result.moreRewards].some((reward) => reward?.type === "virtual_currency");
        done(result.failed || !coins ? "failed" : "rewarded");
      },
    }).catch(() => done("failed"));
  });
}
