import { act, render, type RenderResult } from "@testing-library/react-native";
import { Text } from "react-native";

import { TICK_MS, TICK_MS_REDUCED, type TurnTiming } from "./turn-clock";
import { TurnClockProvider, useTurnAnnouncement, useTurnClock, useTurnTimer } from "./use-turn-clock";

const SERVER = 1_700_000_000_000;

/** One shared monotonic reading, so a test can move the clock by hand. */
let monotonic = 0;
const clock = () => monotonic;

function ClockProbe() {
  const { nowMs } = useTurnClock();
  return <Text testID="now">{String(nowMs)}</Text>;
}

function TimerProbe({ timing }: { timing: TurnTiming }) {
  const view = useTurnTimer(timing);
  const announcement = useTurnAnnouncement(view, "Magnus to act");
  return (
    <>
      <Text testID="remaining">{String(view.remainingMs)}</Text>
      <Text testID="urgency">{view.urgency}</Text>
      <Text testID="announcement">{announcement ?? ""}</Text>
    </>
  );
}

function clocked(children: React.ReactNode, clockSource: () => number = clock) {
  return (
    <TurnClockProvider clock={clockSource} sample={{ serverNowMs: SERVER, atMonotonicMs: 0 }}>
      {children}
    </TurnClockProvider>
  );
}

/**
 * Move both the monotonic source and the timer queue together.
 *
 * The `act` here has to be async: React 19's renderer commits timer-driven updates
 * on a microtask, so a synchronous `act` advances the interval without the re-render
 * ever reaching the query tree.
 */
async function advance(ms: number) {
  await act(async () => {
    monotonic += ms;
    jest.advanceTimersByTime(ms);
  });
}

function text(view: RenderResult, id: string) {
  return String(view.getByTestId(id).props.children);
}

beforeEach(() => {
  jest.useFakeTimers();
  monotonic = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TurnClockProvider", () => {
  test("advances the corrected clock with the monotonic source, not the wall clock", async () => {
    const view = await render(clocked(<ClockProbe />));

    expect(text(view, "now")).toBe(String(SERVER));

    // The wall clock is never read, so only the monotonic delta can move this.
    await advance(2500);
    expect(text(view, "now")).toBe(String(SERVER + 2500));
  });

  test("rebases onto a resynchronized sample without waiting for the next tick", async () => {
    const view = await render(clocked(<ClockProbe />));
    await advance(1000);
    expect(text(view, "now")).toBe(String(SERVER + 1000));

    // The server now says it is five seconds later than the client believed. The very
    // next render must already show the corrected time, or the countdown would run a
    // full cadence behind the truth after every resync.
    const corrected = SERVER + 5000;
    await view.rerender(
      <TurnClockProvider clock={clock} sample={{ serverNowMs: corrected, atMonotonicMs: monotonic }}>
        <ClockProbe />
      </TurnClockProvider>,
    );
    expect(text(view, "now")).toBe(String(corrected));

    // And it keeps running from the new anchor.
    await advance(TICK_MS);
    expect(text(view, "now")).toBe(String(corrected + TICK_MS));
  });

  test("stops reading the clock once unmounted", async () => {
    // The clock source is only ever read from the tick, so a read after unmount is
    // exactly the leak this guards: an interval that outlived its provider.
    let reads = 0;
    const counted = () => {
      reads += 1;
      return monotonic;
    };

    const view = await render(clocked(<ClockProbe />, counted));
    await advance(TICK_MS * 2);
    const readsWhileMounted = reads;

    await view.unmount();
    await advance(TICK_MS * 8);

    expect(readsWhileMounted).toBeGreaterThan(0);
    expect(reads).toBe(readsWhileMounted);
  });

  test("steps the clock at the reduced-motion cadence when asked", async () => {
    const view = await render(
      <TurnClockProvider
        clock={clock}
        reduceMotion
        sample={{ serverNowMs: SERVER, atMonotonicMs: 0 }}>
        <ClockProbe />
      </TurnClockProvider>,
    );

    // A quarter of the normal cadence passes and the clock has not moved: this is
    // what makes the arc step rather than sweep.
    await advance(TICK_MS - 1);
    expect(text(view, "now")).toBe(String(SERVER));

    await advance(TICK_MS_REDUCED - TICK_MS + 1);
    expect(text(view, "now")).toBe(String(SERVER + TICK_MS_REDUCED));
  });
});

describe("useTurnTimer", () => {
  const timing: TurnTiming = {
    startedAtMs: SERVER,
    endsAtMs: SERVER + 10_000,
    pausedAtMs: null,
  };

  test("counts down and crosses the urgency bands in step with the shared clock", async () => {
    const view = await render(clocked(<TimerProbe timing={timing} />));

    expect(text(view, "remaining")).toBe("10000");
    expect(text(view, "urgency")).toBe("calm");

    await advance(6500);
    expect(text(view, "remaining")).toBe("3500");
    expect(text(view, "urgency")).toBe("warn");

    await advance(2500);
    expect(text(view, "urgency")).toBe("critical");

    await advance(2000);
    expect(text(view, "remaining")).toBe("0");
  });

  test("holds the paused remaining time still while the clock keeps running", async () => {
    const view = await render(clocked(<TimerProbe timing={timing} />));
    await advance(4000);
    const beforePause = text(view, "remaining");

    await view.rerender(clocked(<TimerProbe timing={{ ...timing, pausedAtMs: SERVER + 4000 }} />));
    await advance(3000);

    expect(text(view, "remaining")).toBe(beforePause);
  });
});

describe("useTurnAnnouncement", () => {
  const timing: TurnTiming = {
    startedAtMs: SERVER,
    endsAtMs: SERVER + 20_000,
    pausedAtMs: null,
  };

  test("does not re-announce on every clock tick, only when the band changes", async () => {
    const view = await render(clocked(<TimerProbe timing={timing} />));

    // Calm says nothing at all.
    expect(text(view, "announcement")).toBe("");

    // Cross into `warn`, then let the clock tick several more times inside the band.
    await advance(12_000);
    const warnText = text(view, "announcement");
    expect(warnText).toContain("Magnus to act");

    await advance(TICK_MS * 3);
    // The clock moved three ticks but the spoken text must be byte-identical: this is
    // the difference between a usable screen reader experience and a metronome.
    expect(text(view, "announcement")).toBe(warnText);

    await advance(5000);
    const criticalText = text(view, "announcement");
    expect(criticalText).not.toBe(warnText);
    expect(criticalText).toContain("Magnus to act");
  });

  test("reports expiry once the budget is spent", async () => {
    const view = await render(clocked(<TimerProbe timing={timing} />));
    await advance(20_000);
    expect(text(view, "announcement")).toContain("time is up");
  });
});
