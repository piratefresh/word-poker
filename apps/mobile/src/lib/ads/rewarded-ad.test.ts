import type { RewardedAd } from "react-native-google-mobile-ads";
import type { RewardVerificationResult } from "react-native-purchases";
import { RevenueCatAdMob } from "react-native-purchases-admob";

import { AdsConsent } from "react-native-google-mobile-ads";

import { loadRewardedAd, showRewardedAd } from "./rewarded-ad";

const mockInitialize = jest.fn();
jest.mock("react-native-google-mobile-ads", () => ({
  __esModule: true,
  default: () => ({ initialize: mockInitialize }),
  AdsConsent: { gatherConsent: jest.fn(), getConsentInfo: jest.fn() },
  AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: "REQUIRED" },
  AdEventType: { CLOSED: "closed", ERROR: "error" },
  RewardedAdEventType: { LOADED: "rewarded_loaded" },
  TestIds: { REWARDED: "test-unit" },
}));
jest.mock("react-native-purchases-admob", () => ({ RevenueCatAdMob: { createRewardedAd: jest.fn(), showWithRewardVerification: jest.fn() } }));
jest.mock("@/lib/wallet/revenuecat", () => ({ configureRevenueCat: jest.fn(), revenuecatAvailable: () => true }));
jest.mock("expo-tracking-transparency", () => ({ requestTrackingPermissionsAsync: jest.fn(async () => ({ granted: false })) }));

type Options = Parameters<typeof RevenueCatAdMob.showWithRewardVerification>[1];

/** An ad whose listeners the test can fire, and a show that hands back the adapter's callbacks. */
function fakeAd() {
  const listeners = new Map<string, () => void>();
  const ad = {
    addAdEventListener: (type: string, fn: () => void) => {
      listeners.set(type, fn);
      return () => listeners.delete(type);
    },
  } as unknown as RewardedAd;
  let options: Options | undefined;
  jest.mocked(RevenueCatAdMob.showWithRewardVerification).mockImplementation(async (_ad, given) => {
    options = given;
  });

  return { ad, fire: (type: string) => listeners.get(type)?.(), options: () => options! };
}

const coins: RewardVerificationResult = { failed: false, reward: { type: "virtual_currency", code: "COIN", amount: 20 }, moreRewards: [] };

describe("showRewardedAd", () => {
  it("is rewarded only once RevenueCat verifies a coin grant", async () => {
    const { ad, fire, options } = fakeAd();
    const outcome = showRewardedAd(ad);
    await Promise.resolve();
    options().onUserEarnedReward?.({ type: "coins", amount: 20 });
    fire("closed");
    options().onRewardVerificationCompleted(coins);
    await expect(outcome).resolves.toBe("rewarded");
  });

  it("is dismissed when closed before the reward", async () => {
    const { ad, fire } = fakeAd();
    const outcome = showRewardedAd(ad);
    await Promise.resolve();
    fire("closed");
    await expect(outcome).resolves.toBe("dismissed");
  });

  it("fails when verification fails", async () => {
    const { ad, options } = fakeAd();
    const outcome = showRewardedAd(ad);
    await Promise.resolve();
    options().onUserEarnedReward?.({ type: "coins", amount: 20 });
    options().onRewardVerificationCompleted({ failed: true, moreRewards: [] });
    await expect(outcome).resolves.toBe("failed");
  });
});

describe("loadRewardedAd", () => {
  it("loads nothing, and starts no ads SDK, until consent allows ads", async () => {
    jest.mocked(AdsConsent.gatherConsent).mockResolvedValue({ canRequestAds: false } as never);
    await expect(loadRewardedAd("coin_store_rewarded")).rejects.toThrow("consent");
    expect(mockInitialize).not.toHaveBeenCalled();
    expect(RevenueCatAdMob.createRewardedAd).not.toHaveBeenCalled();
  });

  it("asks again on the next load after a refusal", async () => {
    jest.mocked(AdsConsent.gatherConsent).mockResolvedValue({ canRequestAds: true } as never);
    jest.mocked(RevenueCatAdMob.createRewardedAd).mockRejectedValue(new Error("stop here"));
    await expect(loadRewardedAd("coin_store_rewarded")).rejects.toThrow("stop here");
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it("asks for App Tracking Transparency before Mobile Ads starts", async () => {
    // A fresh module: the ones above already started ads, and that start is kept.
    await jest.isolateModulesAsync(async () => {
      const ads: typeof import("react-native-google-mobile-ads") = require("react-native-google-mobile-ads");
      const admob: typeof import("react-native-purchases-admob") = require("react-native-purchases-admob");
      const att: typeof import("expo-tracking-transparency") = require("expo-tracking-transparency");
      const { loadRewardedAd: load }: typeof import("./rewarded-ad") = require("./rewarded-ad");
      jest.mocked(ads.AdsConsent.gatherConsent).mockResolvedValue({ canRequestAds: true } as never);
      jest.mocked(admob.RevenueCatAdMob.createRewardedAd).mockRejectedValue(new Error("stop here"));
      mockInitialize.mockClear();

      await expect(load("coin_store_rewarded")).rejects.toThrow("stop here");
      const [asked] = jest.mocked(att.requestTrackingPermissionsAsync).mock.invocationCallOrder;
      const [started] = mockInitialize.mock.invocationCallOrder;
      expect(asked).toBeLessThan(started);
    });
  });
});
