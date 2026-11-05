/**
 * use-daily-bonus.ts — the store's DAILY BONUS card, kept live (STO-1045).
 *
 * `dailyBonus` decides what the card shows from the quest state and the UTC day it was read on; this
 * hook records that day whenever the state changes, ticks the countdown once a second while today is
 * claimed, and turns the streak banner a store claim earns into `onClaimed`'s reward.
 */

import { isAccountEligible } from "@wordpoker/contracts";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/auth/client/auth-client";
import { useQuests } from "@/lib/quests/quests-provider";

import { dailyBonus, utcDay, type DailyBonus } from "./daily-bonus";

export function useDailyBonus(onClaimed: (reward: number) => void): { bonus: DailyBonus; claim: () => void } {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { state, refresh, streakBanner, dismissStreakBanner } = useQuests();
  const [now, setNow] = useState(() => Date.now());
  const claiming = useRef(false);

  // The UTC day each quest state arrived on, noted while rendering it. `now` is fresh then: it is set
  // on mount and by CLAIM, the store's own re-read.
  const [read, setRead] = useState(() => ({ state, day: state ? utcDay(now) : null }));
  const day = state ? utcDay(now) : null;
  if (read.state !== state) setRead({ state, day });
  const readDay = read.state === state ? read.day : day;

  const bonus = dailyBonus({
    state,
    readDay,
    now,
    signedIn: !!user && !user.isAnonymous,
    eligible: !!user && isAccountEligible(user),
  });

  const ticking = bonus.status === "claimed";
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [ticking]);

  // Only a claim made here becomes the store's toast; the home street shows its own banner.
  useEffect(() => {
    if (!streakBanner || !claiming.current) return;
    claiming.current = false;
    onClaimed(streakBanner.reward);
    dismissStreakBanner();
  }, [dismissStreakBanner, onClaimed, streakBanner]);

  const claim = () => {
    claiming.current = true;
    setNow(Date.now());
    refresh();
  };

  return { bonus, claim };
}
