/**
 * turn-clock.ts — the shared, corrected turn clock.
 *
 * One clock serves the HUD countdown and every seat's turn ring, so a seat never
 * starts its own interval and no two surfaces can disagree about how long is
 * left. The server stays authoritative: it sends wall-clock timestamps, and this
 * module only turns them into "how much is left right now".
 *
 * The local wall clock is deliberately not trusted. `correctedNowMs` advances a
 * server timestamp by a *monotonic* delta, so a device whose clock is wrong,
 * jumps on an NTP correction, or crosses a DST boundary still counts down at the
 * right speed.
 */

/** Local monotonic milliseconds — `performance.now()` and friends. */
export type MonotonicMs = number;

/** One server timestamp anchored to the local monotonic clock when it arrived. */
export interface ClockSample {
  /** Server wall-clock milliseconds at the instant the sample was produced. */
  serverNowMs: number;
  /** Local monotonic reading taken when that value became true. */
  atMonotonicMs: MonotonicMs;
}

/**
 * Estimate the server's current wall clock from a sample plus the elapsed
 * monotonic time since it arrived. A negative delta is legal: callers may anchor
 * a sample to an earlier monotonic reading, and the arithmetic still holds.
 */
export function correctedNowMs(sample: ClockSample, monotonicNowMs: MonotonicMs): number {
  return sample.serverNowMs + (monotonicNowMs - sample.atMonotonicMs);
}

/**
 * The turn budget as the server states it. Pauses are resolved server-side: while
 * `pausedAtMs` is set the clock freezes, and the server extends `endsAtMs` when it
 * resumes. The client never mutates timing, which is why there is no accumulated
 * paused total here.
 */
export interface TurnTiming {
  /** Server wall clock when the turn opened. */
  startedAtMs: number;
  /** Server wall clock when the turn expires. */
  endsAtMs: number;
  /** Server wall clock when the live pause began, or `null` while running. */
  pausedAtMs: number | null;
}

/** Elapsed share of the budget at which the turn starts warning, then alarming. */
export const URGENCY_WARN_AT = 0.6;
export const URGENCY_CRITICAL_AT = 0.85;

export type TurnUrgency = "calm" | "warn" | "critical";

export interface TurnTimerView {
  /** ms left. Clamped at zero, and frozen while paused. */
  remainingMs: number;
  /** Budget as delivered. Never negative. */
  totalMs: number;
  /** ms spent, pauses excluded, clamped into the budget. */
  elapsedMs: number;
  /** Spent share of the budget, 0..1. Drives the arc sweep. */
  elapsedFraction: number;
  urgency: TurnUrgency;
  /** The budget is spent. Held at `critical` until new timing props arrive. */
  expired: boolean;
  paused: boolean;
}

/**
 * Resolve a turn's countdown at a given instant. Pure, so the same view is
 * reproducible in tests and in every consumer.
 *
 * Degenerate timing (an end at or before the start) resolves straight to expired
 * rather than dividing by zero — the UI shows a full critical ring instead of NaN.
 */
export function deriveTurnTimer(timing: TurnTiming, nowMs: number): TurnTimerView {
  const totalMs = Math.max(0, timing.endsAtMs - timing.startedAtMs);
  const paused = timing.pausedAtMs !== null;
  // While paused the countdown is pinned to the instant the pause began, so the
  // arc stops rather than draining behind the player's back.
  const effectiveNowMs = paused ? (timing.pausedAtMs as number) : nowMs;

  // Clamped at both ends: a corrected clock that runs behind the turn start must not
  // advertise more time than the server granted, or the arc would sweep past full.
  const remainingMs = Math.min(totalMs, Math.max(0, timing.endsAtMs - effectiveNowMs));
  const elapsedMs = Math.min(totalMs, Math.max(0, effectiveNowMs - timing.startedAtMs));
  const elapsedFraction = totalMs > 0 ? elapsedMs / totalMs : 1;
  const expired = remainingMs <= 0;

  return {
    remainingMs,
    totalMs,
    elapsedMs,
    elapsedFraction,
    urgency: urgencyFor(elapsedFraction),
    expired,
    paused,
  };
}

/** Expiry is itself the loudest state, so a spent budget is always `critical`. */
function urgencyFor(elapsedFraction: number): TurnUrgency {
  if (elapsedFraction >= URGENCY_CRITICAL_AT) return "critical";
  if (elapsedFraction >= URGENCY_WARN_AT) return "warn";
  return "calm";
}

/** Clock cadence, in ms, by motion preference. A steppy clock is calmer to watch. */
export const TICK_MS = 250;
export const TICK_MS_REDUCED = 1000;

/** `00:37` — mm:ss, floored, never negative. */
export function formatClockMs(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * What a screen reader should hear when a turn's urgency changes.
 *
 * Announcements are driven by band changes rather than ticks: a live region that
 * re-reads the countdown every second is unusable, so `calm` stays silent and the
 * two urgent bands speak once as they are entered. The two bands use different
 * wording, so the urgency is conveyed by more than the clock's colour.
 */
export function turnAnnouncement(
  view: Pick<TurnTimerView, "remainingMs" | "urgency" | "expired">,
  phrase = "Your turn",
): string | null {
  const seconds = Math.ceil(view.remainingMs / 1000);
  if (view.expired) return `${phrase}: time is up`;
  switch (view.urgency) {
    case "critical":
      return `${phrase}: ${seconds} seconds, hurry`;
    case "warn":
      return `${phrase}: ${seconds} seconds left`;
    case "calm":
      return null;
  }
}
