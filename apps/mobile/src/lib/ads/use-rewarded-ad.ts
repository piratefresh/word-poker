/**
 * use-rewarded-ad.ts — one placement's "watch an ad for coins" button (STO-1063).
 *
 * Reads today's count from the server (so it survives a reinstall), preloads an ad while there are
 * views left, and after a verified view re-reads the HUD's coins, which plays the coin pill's bump.
 * Placements live only on the store and the lobby, never at a table, so no ad plays mid-hand.
 */

import { useCallback, useEffect, useState } from "react";
import type { AdPlacement } from "@wordpoker/contracts";

import {
  adPrivacyOptionsRequired,
  loadRewardedAd,
  rewardedAdsAvailable,
  showAdPrivacyOptions,
  showRewardedAd,
  type AdOutcome,
} from "@/lib/ads/rewarded-ad";
import { useQuests } from "@/lib/quests/quests-provider";
import { useRevenueCatReady } from "@/lib/wallet/use-revenuecat";
import { fetchAdRewardsLeft } from "@/lib/wallet/wallet-client";

type LoadedAd = Awaited<ReturnType<typeof loadRewardedAd>>;

export interface RewardedAdButton {
  /** Whether to draw the button at all: a platform with ads and a player the server counts for. */
  readonly visible: boolean;
  /** Views left today; `null` until read. */
  readonly left: number | null;
  /** A view is playing or being verified. */
  readonly busy: boolean;
  /** `unavailable`: no ad had loaded ("No ads available right now"). */
  watch(): Promise<AdOutcome | "unavailable">;
  /** Reopens the consent form; set only where UMP needs a way to change the answer (EEA and similar). */
  readonly privacyOptions: (() => Promise<void>) | null;
}

export function useRewardedAd(placement: AdPlacement, userId: string | undefined): RewardedAdButton {
  const available = rewardedAdsAvailable() && userId !== undefined;
  const ready = useRevenueCatReady(userId);
  const { refreshCoins } = useQuests();
  const [left, setLeft] = useState<number | null>(null);
  const [ad, setAd] = useState<LoadedAd | null>(null);
  const [busy, setBusy] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // Bumped after each show: a verification token is single-use, so the next view needs a new ad.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!available) return;
    let current = true;
    fetchAdRewardsLeft()
      .then((count) => current && setLeft(count))
      .catch(() => current && setLeft(null));

    return () => {
      current = false;
    };
  }, [available, userId]);

  useEffect(() => {
    if (!available || !ready || !left) return;
    let current = true;
    loadRewardedAd(placement)
      .then((loaded) => {
        if (current) setAd(loaded);
        // Consent is gathered by now, so UMP knows whether the player needs a way back to it.
        return adPrivacyOptionsRequired();
      })
      .then((required) => current && setPrivacy(required))
      .catch((error: unknown) => console.warn(`[ads] ${placement} did not load:`, error));

    return () => {
      current = false;
    };
  }, [available, ready, left, placement, generation]);

  const watch = useCallback(async (): Promise<AdOutcome | "unavailable"> => {
    if (!ad) return "unavailable";
    setBusy(true);
    setAd(null);
    try {
      const outcome = await showRewardedAd(ad);
      if (outcome === "rewarded") {
        // The webhook that counts this view can trail the grant, so count it here too.
        setLeft((count) => (count === null ? null : Math.max(0, count - 1)));
        void refreshCoins();
      }

      return outcome;
    } finally {
      setBusy(false);
      setGeneration((n) => n + 1);
    }
  }, [ad, refreshCoins]);

  return {
    visible: available && left !== null,
    left,
    busy,
    watch,
    privacyOptions: privacy ? showAdPrivacyOptions : null,
  };
}

/** The line a placement shows after a view that paid nothing; `null` after a paid one. */
export function adOutcomeNote(outcome: AdOutcome | "unavailable"): string | null {
  if (outcome === "unavailable") return "No ads available right now.";
  if (outcome === "dismissed") return "Watch to the end to earn coins.";
  if (outcome === "failed") return "That ad didn't pay out. Try another.";

  return null;
}
