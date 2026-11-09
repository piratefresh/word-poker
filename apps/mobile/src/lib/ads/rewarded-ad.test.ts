import type { RewardedAd } from "react-native-google-mobile-ads";
import type { RewardVerificationResult } from "react-native-purchases";
import { RevenueCatAdMob } from "react-native-purchases-admob";

import { loadRewardedAd, showRewardedAd } from "./rewarded-ad";

/** The order the consent gate touched each SDK in. */
const mockCalls: string[] = [];
let mockCanRequestAds = true;

jest.mock("react-native-google-mobile-ads", () => ({
  __esModule: true,
  default: () => ({ initialize: async () => mockCalls.push("initialize") }),
  AdsConsent: {
    gatherConsent: async () => {
      mockCalls.push("consent");
      return { canRequestAds: mockCanRequestAds };
    },
  },
  AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: "REQUIRED" },
  AdEventType: { CLOSED: "closed", ERROR: "error" },
  RewardedAdEventType: { LOADED: "rewarded_loaded" },
  TestIds: { REWARDED: "test-unit" },
}));
jest.mock("expo-tracking-transparency", () => ({ requestTrackingPermissionsAsync: async () => mockCalls.push("att") }));
jest.mock("react-native-purchases-admob", () => ({
  RevenueCatAdMob: {
    showWithRewardVerification: jest.fn(),
    createRewardedAd: jest.fn(async () => {
      mockCalls.push("request");
      return {
        addAdEventListener: (type: string, fn: () => void) => {
          if (type === "rewarded_loaded") setTimeout(fn);
          return () => {};
        },
        load: () => {},
      };
    }),
  },
}));
jest.mock("@/lib/wallet/revenuecat", () => ({ configureRevenueCat: jest.fn(), revenuecatAvailable: () => true }));

// Runs first: the gate memoizes a granted consent for the session.
describe("loadRewardedAd consent gate (iOS)", () => {
  beforeEach(() => {
    mockCalls.length = 0;
  });

  it("requests no ad while UMP says ads can't be requested, and asks again next time", async () => {
    mockCanRequestAds = false;
    await expect(loadRewardedAd("coin_store_rewarded")).rejects.toThrow("No ad consent yet.");
    expect(mockCalls).toEqual(["consent"]);
  });

  it("gathers consent, then tracking permission, then initializes, then requests", async () => {
    mockCanRequestAds = true;
    await loadRewardedAd("coin_store_rewarded");
    expect(mockCalls).toEqual(["consent", "att", "initialize", "request"]);
  });
});

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
