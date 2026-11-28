/**
 * streak-reminder.ts — a local notification the day after the streak was credited, before it
 * breaks (STO-1191). No server: each credited read (`GET /api/quests`) replaces the one reminder,
 * so opening the app moves it to the next day and a player who came back never sees the old one.
 * The web build has none (`.web.ts`).
 *
 * The streak counts UTC days (`creditDailyStreak`): credited on day D, it survives until day D+2
 * starts. The reminder is the latest local evening inside day D+1, so a tap still credits.
 */

import * as Notifications from "expo-notifications";

import { readItem, writeItem } from "@/lib/storage/claim-store";
import { streakReward } from "@/components/screens/store/daily-bonus";

const ID = "streak-reminder";
const OFF_KEY = "streak-reminder-off";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Local hour the reminder aims for. */
const EVENING = 19;

/** When the reminder for a streak credited at `now` should fire. */
export function reminderTime(now: number): number {
  const opens = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS; // UTC day D+1: a claim continues the streak
  const deadline = opens + DAY_MS; // UTC day D+2: the streak is gone
  for (const days of [1, 0]) {
    const evening = new Date(now);
    evening.setDate(evening.getDate() + days);
    evening.setHours(EVENING, 0, 0, 0);
    const at = evening.getTime();
    if (at >= opens && at <= deadline - 60 * 60 * 1000) return at;
  }

  // ponytail: no local evening fits the window (only near the date line); fall back to 3h before the end.
  return deadline - 3 * 60 * 60 * 1000;
}

/** The copy names the streak and what tomorrow pays, not the app. */
export function reminderContent(current: number): Notifications.NotificationContentInput {
  return {
    title: `Your ${current}-day streak is about to end`,
    body: `+${streakReward(current + 1)} coins waiting. Open today to keep it.`,
    data: { url: "wordpoker://home" },
  };
}

export function streakReminderOn(): boolean {
  return readItem(OFF_KEY) !== "1";
}

export async function cancelStreakReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
}

/** Replace the reminder for a streak of `current` days credited today. */
export async function scheduleStreakReminder(current: number, now = Date.now()): Promise<void> {
  await cancelStreakReminder();
  if (current < 1 || !streakReminderOn()) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: reminderContent(current),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderTime(now), channelId: "default" },
  });
}

/** The settings switch. Off cancels now; on waits for the next credited read to schedule. */
export function setStreakReminderOn(on: boolean): void {
  writeItem(OFF_KEY, on ? "0" : "1");
  if (!on) void cancelStreakReminder();
}
