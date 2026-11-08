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
import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfoOptions,
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

/**
 * Dev builds only: `EXPO_PUBLIC_ADS_DEBUG_GEOGRAPHY=EEA` (or `REGULATED_US_STATE`, `NOT_EEA`) makes UMP
 * act as if the player were there, so the consent form can be tested from anywhere. Emulators and
 * simulators count as test devices; a phone needs its hashed id (logged by UMP) in
 * `EXPO_PUBLIC_ADS_TEST_DEVICE`.
 */
function consentDebug(): AdsConsentInfoOptions {
  const geography = process.env.EXPO_PUBLIC_ADS_DEBUG_GEOGRAPHY as keyof typeof AdsConsentDebugGeography | undefined;
  if (!__DEV__ || !geography) return {};
  const device = process.env.EXPO_PUBLIC_ADS_TEST_DEVICE;

  return { debugGeography: AdsConsentDebugGeography[geography], testDeviceIdentifiers: device ? [device] : [] };
}

let initialized: Promise<boolean> | null = null;

/**
 * Consent, then (iOS) tracking, then RevenueCat and Mobile Ads; resolves whether ads may be
 * requested (STO-1061). Runs before the first ad load rather than at launch, so a player who never
 * opens the store or lobby is never asked. UMP shows its form only where the law needs it and
 * remembers the answer; a "no" still gets ads, because the SDK reads UMP's consent string and
 * serves non-personalized ones on its own.
 */
async function gate(): Promise<boolean> {
  // Offline or a form error: fall back to the answer saved from an earlier session.
  const consent = await AdsConsent.gatherConsent(consentDebug()).catch(() => AdsConsent.getConsentInfo());
  if (!consent.canRequestAds) return false;
  if (Platform.OS === "ios") await requestTrackingPermissionsAsync();
  // RevenueCat first: the adapter only tracks while Purchases is configured.
  configureRevenueCat();
  await mobileAds().initialize();

  return true;
}

function initAds(): Promise<boolean> {
  initialized ??= gate().catch(() => false).then((ok) => {
    // No answer yet (or a failure): ask again before the next ad instead of staying shut for the session.
    if (!ok) initialized = null;
    return ok;
  });

  return initialized;
}

/** Whether UMP wants an "Ad privacy" button (EEA and similar), so the player can change their answer. */
export async function adPrivacyOptionsRequired(): Promise<boolean> {
  const { privacyOptionsRequirementStatus } = await AdsConsent.getConsentInfo();

  return privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
}

export async function showAdPrivacyOptions(): Promise<void> {
  await AdsConsent.showPrivacyOptionsForm();
}

/**
 * A loaded ad for one placement. Verification tokens are single-use, so each view needs a new
 * one: load the next after showing this one.
 */
export async function loadRewardedAd(placement: AdPlacement): Promise<RewardedAd> {
  const unit = unitId();
  if (!unit) throw new Error("No rewarded ads on this platform yet.");
  if (!(await initAds())) throw new Error("No ad consent yet.");
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
