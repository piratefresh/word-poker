import { lastSeenLabel } from "./last-seen";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test.each([
  [ago(10_000), "Seen just now"],
  [ago(5 * 60_000), "Seen 5m ago"],
  [ago(3 * 3_600_000 + 59 * 60_000), "Seen 3h ago"],
  [ago(30 * 3_600_000), "Seen yesterday"],
  [ago(9 * 86_400_000), "Seen 9d ago"],
  [new Date(NOW + 60_000).toISOString(), "Seen just now"],
])("%s reads %s", (lastSeen, label) => {
  expect(lastSeenLabel(lastSeen, NOW)).toBe(label);
});

test("nothing to show without a valid time", () => {
  expect(lastSeenLabel(undefined, NOW)).toBeNull();
  expect(lastSeenLabel("not a date", NOW)).toBeNull();
});
