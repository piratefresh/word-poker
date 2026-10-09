import { levelForXp } from "@wordpoker/game-rules";

import { placementLabel, xpBreakdown, xpSteps, xpView } from "./xp-overlay-model";
import { seatFixture } from "./results-fixtures";

test("places read as ordinals, teens included", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(placementLabel)).toEqual([
    "1ST PLACE", "2ND PLACE", "3RD PLACE", "4TH PLACE", "11TH PLACE", "12TH PLACE", "13TH PLACE", "21ST PLACE", "22ND PLACE",
  ]);
});

test("a loss pays participation plus the word's score, and a zero-score word still pays participation", () => {
  expect(xpBreakdown(seatFixture({ name: "You", total: 17 }))).toEqual({ participation: 10, word: 17, total: 27 });
  expect(xpBreakdown(seatFixture({ name: "You", total: 0 }))).toEqual({ participation: 10, word: 0, total: 10 });
});

test("one step when no level is crossed, a full bar and a reset for each crossing", () => {
  expect(xpSteps(10, 30)).toHaveLength(2);
  const single = xpSteps(90, 130);
  expect(single.map((step) => [step.level, Math.round(step.progress)])).toEqual([[1, 90], [1, 100], [2, 0], [2, Math.round(single[3].progress)]]);
  expect(single[3].progress).toBeGreaterThan(0);

  const multiple = xpSteps(90, 400);
  const end = levelForXp(400);
  expect(multiple.filter((step) => step.progress === 100)).toHaveLength(end.level - 1);
  expect(multiple.at(-1)?.level).toBe(end.level);
});

const report = { handToken: "t1", baselineXp: 50 };

test("pending predicts instantly from the frozen baseline", () => {
  expect(xpView(report, 27, {})).toEqual({ sync: "pending", fromXp: 50, toXp: 77 });
  expect(xpView({ handToken: "t1", baselineXp: null }, 27, {})).toEqual({ sync: "pending", fromXp: null, toXp: null });
});

test("confirmation takes the server's total; other claims' answers are ignored", () => {
  const outcomes = { t1: { status: "confirmed", xp: 90, level: 1 }, other: { status: "confirmed", xp: 999, level: 9 } } as const;
  expect(xpView(report, 27, outcomes)).toEqual({ sync: "confirmed", fromXp: 50, toXp: 90 });
  expect(xpView(report, 27, { other: outcomes.other })).toMatchObject({ sync: "pending", toXp: 77 });
});

test("a rejected claim stays at the baseline; signed out claims nothing", () => {
  expect(xpView(report, 27, { t1: { status: "rejected" } })).toEqual({ sync: "rejected", fromXp: 50, toXp: 50 });
  expect(xpView(null, 27, {}).sync).toBe("signed-out");
});
