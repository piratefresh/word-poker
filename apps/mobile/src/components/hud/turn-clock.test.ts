import {
  correctedNowMs,
  deriveTurnTimer,
  formatClockMs,
  turnAnnouncement,
  type TurnTimerView,
  type TurnTiming,
} from "./turn-clock";

const SECOND = 1000;
const START = 1_700_000_000_000;

/** A 40-second turn opening at `START`. */
function turn(overrides: Partial<TurnTiming> = {}): TurnTiming {
  return {
    startedAtMs: START,
    endsAtMs: START + 40 * SECOND,
    pausedAtMs: null,
    ...overrides,
  };
}

describe("correctedNowMs", () => {
  test("advances a server timestamp by the monotonic delta only", () => {
    const sample = { serverNowMs: START, atMonotonicMs: 500 };
    expect(correctedNowMs(sample, 500)).toBe(START);
    expect(correctedNowMs(sample, 3500)).toBe(START + 3000);
  });

  test("is unaffected by how far the local wall clock has drifted", () => {
    // The sample is anchored to monotonic time, so a device clock that jumps by an
    // hour between two readings cannot change the estimate.
    const sample = { serverNowMs: START, atMonotonicMs: 1_000_000 };
    expect(correctedNowMs(sample, 1_002_000)).toBe(START + 2000);
  });
});

describe("deriveTurnTimer", () => {
  test("a fresh turn has its whole budget and is calm", () => {
    const view = deriveTurnTimer(turn(), START);
    expect(view).toMatchObject({
      remainingMs: 40 * SECOND,
      totalMs: 40 * SECOND,
      elapsedMs: 0,
      elapsedFraction: 0,
      urgency: "calm",
      expired: false,
      paused: false,
    });
  });

  test.each([
    // fraction, expected band. The thresholds themselves are the boundary.
    [0, "calm"],
    [0.599, "calm"],
    [0.6, "warn"],
    [0.849, "warn"],
    [0.85, "critical"],
    [1, "critical"],
  ])("at %p elapsed the band is %p", (fraction, urgency) => {
    const view = deriveTurnTimer(turn(), START + Math.round(40 * SECOND * fraction));
    expect(view.urgency).toBe(urgency);
  });

  test("freezes while paused, whatever the clock says", () => {
    const pausedAtMs = START + 10 * SECOND;
    const paused = turn({ pausedAtMs });
    const atPause = deriveTurnTimer(paused, pausedAtMs);
    const muchLater = deriveTurnTimer(paused, START + 60 * SECOND);

    expect(atPause.paused).toBe(true);
    expect(muchLater.remainingMs).toBe(atPause.remainingMs);
    expect(muchLater.elapsedFraction).toBe(atPause.elapsedFraction);
  });

  test("holds critical and expired after the budget is spent", () => {
    const deadline = START + 40 * SECOND;
    for (const nowMs of [deadline, deadline + SECOND, deadline + 60 * SECOND]) {
      const view = deriveTurnTimer(turn(), nowMs);
      expect(view.expired).toBe(true);
      expect(view.urgency).toBe("critical");
      expect(view.remainingMs).toBe(0);
      expect(view.elapsedFraction).toBe(1);
    }
  });

  test("clamps a clock that runs ahead of the turn start", () => {
    const view = deriveTurnTimer(turn(), START - 5 * SECOND);
    expect(view.remainingMs).toBe(40 * SECOND);
    expect(view.elapsedMs).toBe(0);
    expect(view.elapsedFraction).toBe(0);
  });

  test("resolves degenerate timing to expired rather than NaN", () => {
    const view = deriveTurnTimer(turn({ endsAtMs: START }), START + SECOND);
    expect(view.expired).toBe(true);
    expect(view.totalMs).toBe(0);
    expect(view.elapsedFraction).toBe(1);
    expect(view.urgency).toBe("critical");
  });
});

describe("formatClockMs", () => {
  test.each([
    [0, "00:00"],
    [999, "00:00"],
    [1000, "00:01"],
    [37 * SECOND, "00:37"],
    [59999, "00:59"],
    [60 * SECOND, "01:00"],
    [61 * SECOND, "01:01"],
    [-500, "00:00"],
  ])("formats %pms as %p", (ms, expected) => {
    expect(formatClockMs(ms)).toBe(expected);
  });
});

function announce(overrides: Partial<TurnTimerView>): string | null {
  return turnAnnouncement({
    remainingMs: 10 * SECOND,
    totalMs: 40 * SECOND,
    elapsedMs: 30 * SECOND,
    elapsedFraction: 0.75,
    urgency: "warn",
    expired: false,
    paused: false,
    ...overrides,
  });
}

describe("turnAnnouncement", () => {
  test("stays silent through the calm band so the clock is not read every second", () => {
    expect(announce({ urgency: "calm" })).toBeNull();
  });

  test("speaks the remaining seconds once a band is entered", () => {
    expect(announce({ urgency: "warn", remainingMs: 10 * SECOND })).toContain("10 seconds");
  });

  test("words the two urgent bands differently so urgency is not colour alone", () => {
    const warn = announce({ urgency: "warn" });
    const critical = announce({ urgency: "critical" });
    expect(critical).not.toBe(warn);
  });

  test("reports expiry as an ended turn", () => {
    expect(announce({ expired: true, remainingMs: 0, urgency: "critical" })).toContain(
      "time is up",
    );
  });

  test("accepts the caller's own turn phrase", () => {
    expect(turnAnnouncement(deriveTurnTimer(turn(), START + 30 * SECOND), "Ellis to act")).toBe(
      "Ellis to act: 10 seconds left",
    );
  });
});
