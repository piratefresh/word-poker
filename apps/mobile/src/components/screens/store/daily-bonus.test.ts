import type { QuestStateResponse } from "@wordpoker/contracts";

import { dailyBonus, formatCountdown, msUntilNextUtcDay, streakReward, utcDay } from "./daily-bonus";

const NOON = Date.parse("2026-11-05T12:00:00.000Z");
const TOMORROW = Date.parse("2026-11-06T00:00:05.000Z");
const LATER = Date.parse("2026-11-08T09:00:00.000Z");

const state = (current: number): QuestStateResponse => ({
  streak: { current, creditedToday: null },
  xp: 0,
  level: 1,
  quests: [],
});

const base = { signedIn: true, eligible: true, readDay: "2026-11-05" };

describe("daily bonus", () => {
  test("counts down to the next UTC day", () => {
    expect(utcDay(NOON)).toBe("2026-11-05");
    expect(msUntilNextUtcDay(NOON)).toBe(12 * 3600 * 1000);
    expect(formatCountdown(msUntilNextUtcDay(NOON))).toBe("12:00:00");
    expect(formatCountdown(3_723_400)).toBe("01:02:03");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });

  test("pays the streak's reward for the day, cycling after a week", () => {
    expect(streakReward(1)).toBe(50);
    expect(streakReward(7)).toBe(300);
    expect(streakReward(8)).toBe(50);
  });

  test("is locked until there is a verified player and a streak to show", () => {
    expect(dailyBonus({ ...base, state: state(1), now: NOON, signedIn: false })).toMatchObject({ status: "locked" });
    expect(dailyBonus({ ...base, state: state(1), now: NOON, eligible: false })).toEqual({
      status: "locked",
      caption: "Verify your email to collect it.",
    });
    expect(dailyBonus({ ...base, state: null, now: NOON })).toMatchObject({ status: "locked" });
  });

  test("shows today's streak reward as claimed, with the countdown", () => {
    expect(dailyBonus({ ...base, state: state(3), now: NOON })).toEqual({
      status: "claimed",
      reward: 100,
      remainingMs: 12 * 3600 * 1000,
    });
  });

  test("opens the next streak day once the UTC day turns", () => {
    expect(dailyBonus({ ...base, state: state(3), now: TOMORROW })).toEqual({ status: "ready", reward: 125 });
  });

  test("offers day one again after a missed day", () => {
    expect(dailyBonus({ ...base, state: state(3), now: LATER })).toEqual({ status: "ready", reward: 50 });
  });
});
