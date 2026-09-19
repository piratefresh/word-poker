import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { useReduceMotion } from "./use-reduce-motion";
import {
  correctedNowMs,
  deriveTurnTimer,
  TICK_MS,
  TICK_MS_REDUCED,
  turnAnnouncement,
  type ClockSample,
  type MonotonicMs,
  type TurnTimerView,
  type TurnTiming,
} from "./turn-clock";

/**
 * The one clock in the tree. Every countdown — the HUD's ring today, each seat's
 * turn arc tomorrow — reads this, so no component starts its own interval and no
 * two surfaces can disagree about how long is left.
 */
interface TurnClockValue {
  /** Corrected server wall clock, republished on the shared cadence. */
  nowMs: number;
  /** The cadence it is publishing at, so consumers can pace their own effects. */
  tickMs: number;
}

const TurnClockContext = createContext<TurnClockValue | null>(null);

/** Monotonic clock source. Overridable so tests need no real timers or wall clock. */
export type MonotonicNow = () => MonotonicMs;

export interface TurnClockProviderProps {
  /**
   * The server's authoritative anchor. A new sample is a resynchronization: the
   * countdown rebases onto it without the interval restarting.
   */
  sample: ClockSample;
  children: ReactNode;
  clock?: MonotonicNow;
  /** Overrides the OS reduced-motion value; the tests use it. */
  reduceMotion?: boolean;
}

function defaultMonotonicNow(): MonotonicMs {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function TurnClockProvider({
  sample,
  children,
  clock,
  reduceMotion: reduceMotionOverride,
}: TurnClockProviderProps) {
  const monotonicNow = clock ?? defaultMonotonicNow;
  const osReduceMotion = useReduceMotion();
  // Reduced motion gets a steppy clock: the arc advances in discrete steps rather
  // than sweeping, which is the treatment that preference asks for.
  const tickMs = (reduceMotionOverride ?? osReduceMotion) ? TICK_MS_REDUCED : TICK_MS;
  const { serverNowMs, atMonotonicMs } = sample;

  // The instant lives in state, written by the interval below. Storing the derived
  // value (rather than a tick counter) is what makes the publisher commit: React
  // re-renders because the clock *value* changed, not because a counter did.
  const [instant, setInstant] = useState(() => ({
    serverNowMs,
    atMonotonicMs,
    nowMs: correctedNowMs({ serverNowMs, atMonotonicMs }, monotonicNow()),
  }));

  // A resynchronization is applied during this render, not in an effect: React
  // re-renders immediately and never commits the stale instant, so the countdown
  // cannot run a full cadence behind the server after a resync. This is React's
  // documented "adjust state when props change" pattern, not a render side effect.
  if (instant.serverNowMs !== serverNowMs || instant.atMonotonicMs !== atMonotonicMs) {
    const resynced = { serverNowMs, atMonotonicMs };
    setInstant({ ...resynced, nowMs: correctedNowMs(resynced, monotonicNow()) });
  }

  useEffect(() => {
    const timer = setInterval(
      () => setInstant((current) => ({ ...current, nowMs: correctedNowMs(current, monotonicNow()) })),
      tickMs,
    );
    return () => clearInterval(timer);
  }, [tickMs, monotonicNow]);

  const value = useMemo(() => ({ nowMs: instant.nowMs, tickMs }), [instant.nowMs, tickMs]);
  return <TurnClockContext.Provider value={value}>{children}</TurnClockContext.Provider>;
}

/** Read the shared clock. Throws outside a provider, which is always a wiring bug. */
export function useTurnClock(): TurnClockValue {
  const value = useContext(TurnClockContext);
  if (!value) throw new Error("useTurnClock must be used within a <TurnClockProvider>");
  return value;
}

/** The countdown for one turn, resolved against the shared clock. */
export function useTurnTimer(timing: TurnTiming): TurnTimerView {
  const { nowMs } = useTurnClock();
  const { startedAtMs, endsAtMs, pausedAtMs } = timing;
  return useMemo(
    () => deriveTurnTimer({ startedAtMs, endsAtMs, pausedAtMs }, nowMs),
    [startedAtMs, endsAtMs, pausedAtMs, nowMs],
  );
}

/**
 * Announce the turn once per *change of state*, never once per tick.
 *
 * The clock republishes four times a second; a live region that followed it would
 * read a new number aloud continuously and make the screen unusable. So the text
 * is only recomputed when the urgency band or expiry actually moves, and that text
 * is what an Android polite live region renders. iOS has no equivalent
 * granularity, so it gets one explicit announcement instead.
 */
export function useTurnAnnouncement(view: TurnTimerView, phrase?: string): string | null {
  const { urgency, expired, remainingMs } = view;
  const [message, setMessage] = useState<string | null>(null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    const key = `${urgency}:${expired}`;
    if (announced.current === key) return;
    announced.current = key;
    const next = turnAnnouncement({ remainingMs, urgency, expired }, phrase);
    setMessage(next);
    if (next && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(next);
  }, [urgency, expired, remainingMs, phrase]);

  return message;
}
