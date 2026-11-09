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
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  RewardedAdEventType,
  TestIds,
  type RewardedAd,
} from "react-native-google-mobile-ads";
import { RevenueCatAdMob } from "react-native-purchases-admob";

import type { AdPlacement } from "@wordpoker/contracts";

import { configureRevenueCat, revenuecatAvailable } from "@/lib/wallet/revenuecat";

/** `rewarded_free_coins` in AdMob, per platform. */
const REWARDED_UNITS: Partial<Record<typeof Platform.OS, string>> = {
  android: "ca-app-pub-4407207030015431/4364831894",
  ios: "ca-app-pub-4407207030015431/7170958632",
};

function unitId(): string | null {
  if (__DEV__) return TestIds.REWARDED;

  return REWARDED_UNITS[Platform.OS] ?? null;
}

/** Whether this build can show rewarded ads: the store SDK is set up and the platform has a unit. */
export function rewardedAdsAvailable(): boolean {
  return revenuecatAvailable() && unitId() !== null;
}

let initialized: Promise<unknown> | null = null;

/**
 * Google's UMP consent message: the GDPR form where the law asks for one, and on iOS the ATT
 * explainer and prompt when the AdMob "IDFA explainer" message is published. It shows only when
 * needed, and remembers the answer. No ad loads until it allows one.
 */
async function gatherConsent(): Promise<void> {
  const info = await AdsConsent.gatherConsent().catch(() => AdsConsent.getConsentInfo());
  if (!info.canRequestAds) throw new Error("Ads need your consent first.");
}

/** RevenueCat first, then consent, then Mobile Ads: the adapter only tracks while Purchases is configured. */
function initAds(): Promise<unknown> {
  configureRevenueCat();
  // A refusal or failure is not kept, so the next load asks again.
  initialized ??= gatherConsent()
    .then(() => mobileAds().initialize())
    .catch((error: unknown) => {
      initialized = null;
      throw error;
    });

  return initialized;
}

/** Whether the player's region needs a way back into the consent form (Account → Privacy choices). */
export async function privacyOptionsRequired(): Promise<boolean> {
  if (!rewardedAdsAvailable()) return false;
  const info = await AdsConsent.requestInfoUpdate().catch(() => null);

  return info?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
}

/** Reopens the consent form so the player can change their ad choices. */
export function showPrivacyOptions(): Promise<unknown> {
  return AdsConsent.showPrivacyOptionsForm();
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
