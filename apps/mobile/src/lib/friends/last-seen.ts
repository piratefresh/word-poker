/**
 * last-seen.ts — an offline friend's last heartbeat as a short label ("Seen 3h ago").
 *
 * The server sends `lastSeen` only within `LAST_SEEN_DAYS`, so there is no "months ago" case.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The label for an ISO timestamp, or null when there is none to show. */
export function lastSeenLabel(lastSeen: string | undefined, now: number = Date.now()): string | null {
  if (!lastSeen) return null;
  const at = Date.parse(lastSeen);
  if (Number.isNaN(at)) return null;
  const ago = Math.max(0, now - at);
  if (ago < MINUTE) return "Seen just now";
  if (ago < HOUR) return `Seen ${Math.floor(ago / MINUTE)}m ago`;
  if (ago < DAY) return `Seen ${Math.floor(ago / HOUR)}h ago`;
  if (ago < 2 * DAY) return "Seen yesterday";
  return `Seen ${Math.floor(ago / DAY)}d ago`;
}
