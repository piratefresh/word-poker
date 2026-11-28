import * as Notifications from "expo-notifications";

import { reminderContent, reminderTime, scheduleStreakReminder, setStreakReminderOn } from "./streak-reminder";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => "streak-reminder"),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
jest.mock("@/lib/storage/claim-store", () => {
  const items = new Map<string, string>();
  return { readItem: (key: string) => items.get(key) ?? null, writeItem: (key: string, value: string) => items.set(key, value) };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);

beforeEach(() => jest.clearAllMocks());

test("fires inside the next UTC day, on a local evening when one fits", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const now = Date.parse("2026-11-05T00:00:00.000Z") + hour * 60 * 60 * 1000;
    const opens = Date.parse("2026-11-06T00:00:00.000Z");
    const at = reminderTime(now);
    expect(at).toBeGreaterThanOrEqual(opens);
    expect(at).toBeLessThanOrEqual(opens + DAY_MS - 60 * 60 * 1000);
    if (at !== opens + DAY_MS - 3 * 60 * 60 * 1000) expect(new Date(at).getHours()).toBe(19);
  }
});

test("names the streak and tomorrow's reward, and opens Home", () => {
  expect(reminderContent(3)).toEqual({
    title: "Your 3-day streak is about to end",
    body: "+125 coins waiting. Open today to keep it.",
    data: { url: "wordpoker://home" },
  });
});

test("each credited read replaces the one reminder", async () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  await scheduleStreakReminder(3, now);
  expect(cancel).toHaveBeenCalledWith("streak-reminder");
  expect(schedule).toHaveBeenCalledWith(
    expect.objectContaining({ identifier: "streak-reminder", trigger: expect.objectContaining({ date: reminderTime(now) }) }),
  );
});

test("the switch off cancels it and keeps it off", async () => {
  setStreakReminderOn(false);
  expect(cancel).toHaveBeenCalledWith("streak-reminder");
  await scheduleStreakReminder(3);
  expect(schedule).not.toHaveBeenCalled();
  setStreakReminderOn(true);
  await scheduleStreakReminder(3);
  expect(schedule).toHaveBeenCalledTimes(1);
});
