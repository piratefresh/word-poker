import { clock, clockSeconds, dayLabel } from "./date";

test("uses local 12-hour time, including midnight, without a period in action logs", () => {
  const evening = new Date(2026, 9, 12, 21, 42, 12);
  const midnight = new Date(2026, 9, 13, 0, 0, 0);
  expect(clock(evening)).toBe("9:42 PM");
  expect(clockSeconds(evening)).toBe("9:42:12");
  expect(clock(midnight.getTime())).toBe("12:00 AM");
  expect(clockSeconds(midnight)).toBe("12:00:00");
});

test("labels calendar days across midnight, month/year boundaries and daylight-saving changes", () => {
  const now = new Date(2026, 0, 1, 0, 1);
  expect(dayLabel(new Date(2026, 0, 1, 0, 0), now)).toBe("Today");
  expect(dayLabel(new Date(2025, 11, 31, 23, 59), now)).toBe("Yesterday");
  expect(dayLabel(new Date(2025, 9, 12).getTime(), now)).toBe("Oct 12");
  expect(dayLabel(new Date(2026, 2, 8, 0), new Date(2026, 2, 9, 0))).toBe("Yesterday");
});
