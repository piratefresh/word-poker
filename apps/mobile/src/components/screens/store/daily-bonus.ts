/**
 * daily-bonus.ts — what the store's DAILY BONUS card shows (STO-1045).
 *
 * The bonus is the login streak (`STREAK_REWARDS`), not a second reward: the quests read credits
 * today's streak day, once per UTC day (`creditDailyStreak`). So once the player's quest state has
 * been read today, today's bonus is in and the card counts down to the next UTC day. When that day
 * comes, the card offers CLAIM, which re-reads quest state and so credits the next streak day.
 */

import { STREAK_REWARDS, type QuestStateResponse } from "@wordpoker/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day `ms` falls on, as the streak's `YYYY-MM-DD` refs name it. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** How long until the next UTC day starts, when the next streak day can be credited. */
export function msUntilNextUtcDay(now: number): number {
  return DAY_MS - (now % DAY_MS);
}

/** `HH:MM:SS`, as the claim button counts down. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** The coins streak day `day` (1-based) pays; day 8 starts the cycle again. */
export function streakReward(day: number): number {
  return STREAK_REWARDS[(Math.max(1, day) - 1) % STREAK_REWARDS.length] ?? STREAK_REWARDS[0];
}

export type DailyBonus =
  /** No streak to show: signed out, unverified, or quest state still loading. */
  | { readonly status: "locked"; readonly caption: string }
  /** A new UTC day since the last read: CLAIM credits `reward`. */
  | { readonly status: "ready"; readonly reward: number }
  /** Today is credited; the next claim opens in `remainingMs`. */
  | { readonly status: "claimed"; readonly reward: number; readonly remainingMs: number };

export interface DailyBonusInput {
  readonly state: QuestStateResponse | null;
  /** The UTC day `state` was read on. */
  readonly readDay: string | null;
  readonly now: number;
  readonly signedIn: boolean;
  /** Verified email or a verified platform account: the streak's own gate. */
  readonly eligible: boolean;
}

export function dailyBonus({ state, readDay, now, signedIn, eligible }: DailyBonusInput): DailyBonus {
  if (!signedIn) return { status: "locked", caption: "Sign in to collect it." };
  if (!eligible) return { status: "locked", caption: "Verify your email to collect it." };
  if (state === null || readDay === null) return { status: "locked", caption: "Checking your streak…" };

  const current = state.streak.current;
  if (current > 0 && readDay === utcDay(now)) {
    return { status: "claimed", reward: streakReward(current), remainingMs: msUntilNextUtcDay(now) };
  }

  // A new day since the read: claiming the day after the read continues the streak; a gap restarts it.
  const continues = current > 0 && utcDay(Date.parse(`${readDay}T00:00:00.000Z`) + DAY_MS) === utcDay(now);

  return { status: "ready", reward: streakReward(continues ? current + 1 : 1) };
}
