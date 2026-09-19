import { render, type RenderResult } from "@testing-library/react-native";
import { processColor, Text } from "react-native";

import { colors } from "@/constants/theme";

import { CountdownRing } from "./countdown-ring";
import { deriveTurnTimer, type TurnTimerView, type TurnTiming } from "./turn-clock";

const SECOND = 1000;
const START = 1_700_000_000_000;
const BUDGET_MS = 40 * SECOND;
const TIMING: TurnTiming = {
  startedAtMs: START,
  endsAtMs: START + BUDGET_MS,
  pausedAtMs: null,
};

/** The view a 40-second turn has once `share` of its budget is spent. */
function spent(share: number): TurnTimerView {
  return deriveTurnTimer(TIMING, START + share * BUDGET_MS);
}

/** A genuine clock view with one field forced to a value the clock cannot emit. */
function forced(overrides: Partial<TurnTimerView>): TurnTimerView {
  return { ...spent(0.5), ...overrides };
}

interface ArcProps {
  stroke: { type: number; payload: number };
  strokeDasharray: number[];
  strokeDashoffset: number;
  strokeWidth: number;
  /** Column-major [a, b, c, d, tx, ty], as react-native-svg resolves a transform. */
  matrix?: [number, number, number, number, number, number];
  cx: number;
  cy: number;
  r: number;
}

/** A plain colour as react-native-svg packs it for the native side. */
function solid(token: string): ArcProps["stroke"] {
  const packed = processColor(token);
  if (typeof packed !== "number") throw new Error(`not a solid colour: ${token}`);
  return { type: 0, payload: packed };
}

const IDENTITY: NonNullable<ArcProps["matrix"]> = [1, 0, 0, 1, 0, 0];

/**
 * What the arc is told to draw — this component's whole output. react-native-svg
 * drops a zero dash offset on the way out, so a dropped offset is read as none.
 */
function arc(view: RenderResult): ArcProps {
  const props = view.getByTestId("ring-progress").props as ArcProps & {
    strokeDashoffset: number | null;
  };
  return { ...props, strokeDashoffset: props.strokeDashoffset ?? 0 };
}

describe("CountdownRing", () => {
  test("drains the arc in step with the spent budget", async () => {
    const view = await render(<CountdownRing testID="ring" view={spent(0)} />);
    expect(arc(view).strokeDashoffset).toBe(0);

    await view.rerender(<CountdownRing testID="ring" view={spent(0.5)} />);
    const half = arc(view).strokeDashoffset;

    await view.rerender(<CountdownRing testID="ring" view={spent(1)} />);
    const drained = arc(view).strokeDashoffset;

    // The dash is one circumference, offset by the spent share, so the drawn arc
    // is proportional: halfway through the turn, half of it is gone.
    expect(half).toBeGreaterThan(0);
    expect(half).toBeCloseTo(drained / 2, 1);
    expect(arc(view).strokeDasharray[0]).toBeCloseTo(drained, 5);
  });

  const BAND_CASES: [share: number, token: string][] = [
    [0.2, colors.success],
    [0.7, colors.warning],
    [0.9, colors.danger],
  ];

  test.each(BAND_CASES)("paints a turn %s spent with its band colour", async (share, token) => {
    const view = await render(<CountdownRing testID="ring" view={spent(share)} />);
    expect(arc(view).stroke).toEqual(solid(token));
  });

  const THICKNESS_CASES: [share: number, base: number, drawn: number][] = [
    [0.2, 3, 3],
    [0.7, 3, 3],
    [0.9, 3, 4],
    [0.9, 5, 6],
  ];

  test.each(THICKNESS_CASES)(
    "draws a %s-spent arc %s pt thick as %s pt",
    async (share, base, drawn) => {
      const view = await render(
        <CountdownRing strokeWidth={base} testID="ring" view={spent(share)} />,
      );
      expect(arc(view).strokeWidth).toBe(drawn);
    },
  );

  const DRAINED_CASES: [label: string, view: TurnTimerView][] = [
    ["a spent budget", spent(1)],
    ["an expired view whose fraction lags", forced({ expired: true, elapsedFraction: 0.4 })],
    ["a fraction that cannot be read", forced({ elapsedFraction: Number.NaN })],
  ];

  test.each(DRAINED_CASES)("draws %s as a finite, empty arc", async (_label, view) => {
    const drawn = arc(await render(<CountdownRing testID="ring" view={view} />));

    expect(Number.isFinite(drawn.strokeDashoffset)).toBe(true);
    expect(drawn.strokeDasharray.every(Number.isFinite)).toBe(true);
    // As much offset as there is dash puts the whole path in the gap: nothing drawn.
    expect(drawn.strokeDashoffset).toBe(drawn.strokeDasharray[0]);
  });

  test("clamps a fraction from outside the budget to the ring's ends", async () => {
    const view = await render(
      <CountdownRing testID="ring" view={forced({ elapsedFraction: -0.5 })} />,
    );
    expect(arc(view).strokeDashoffset).toBe(0);

    await view.rerender(<CountdownRing testID="ring" view={forced({ elapsedFraction: 2 })} />);
    expect(arc(view).strokeDashoffset).toBe(arc(view).strokeDasharray[0]);
  });

  test("is one labelled element when labelled, and decoration when not", async () => {
    const view = await render(
      <CountdownRing
        accessibilityLabel="Turn timer, 20 seconds left"
        testID="ring"
        view={spent(0.5)}
      >
        <Text>00:20</Text>
      </CountdownRing>,
    );
    expect(view.getByLabelText("Turn timer, 20 seconds left")).toBeTruthy();
    expect(view.getByRole("timer")).toBeTruthy();

    await view.rerender(
      <CountdownRing testID="ring" view={spent(0.5)}>
        <Text>00:20</Text>
      </CountdownRing>,
    );
    expect(view.getByTestId("ring").props.accessible).toBe(false);
    expect(view.queryByRole("timer")).toBeNull();
    // Unlabelled, the centred clock text is what carries the meaning.
    expect(view.getByText("00:20")).toBeTruthy();
  });

  /**
   * An SVG circle path starts at 3 o'clock and sweeps clockwise, so a drained
   * clockwise arc still only *begins* at the top if the element is rotated a
   * quarter turn about its own centre.
   */
  test("turns the arc's start from 3 o'clock to 12 o'clock", async () => {
    const drawn = arc(await render(<CountdownRing testID="ring" view={spent(0.5)} />));
    // Column-major [a, b, c, d, tx, ty]: x' = a·x + c·y + tx, y' = b·x + d·y + ty. An
    // absent matrix is identity — react-native-svg draws the element untransformed.
    const [a, b, c, d, tx, ty] = drawn.matrix ?? IDENTITY;
    const threeOClock = { x: drawn.cx + drawn.r, y: drawn.cy };
    const started = {
      x: a * threeOClock.x + c * threeOClock.y + tx,
      y: b * threeOClock.x + d * threeOClock.y + ty,
    };

    expect(started.x).toBeCloseTo(drawn.cx, 5);
    expect(started.y).toBeCloseTo(drawn.cy - drawn.r, 5);
  });

  test("draws no arc when the box cannot hold the stroke", async () => {
    const view = await render(
      <CountdownRing size={3} strokeWidth={3} testID="ring" view={spent(0.5)}>
        <Text>00:20</Text>
      </CountdownRing>,
    );
    expect(view.queryByTestId("ring-progress")).toBeNull();
    expect(view.getByText("00:20")).toBeTruthy();
  });
});
