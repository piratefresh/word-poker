import { render, type RenderResult } from "@testing-library/react-native";
import { act } from "react";
import { AccessibilityInfo, processColor } from "react-native";
import { Easing, withRepeat, withTiming } from "react-native-reanimated";
import type { TestInstance } from "test-renderer";

import { PokerChipHero, type PokerChipHeroProps } from "./poker-chip-hero";

// The suite's reanimated mock runs animations instantly, so a chip's cadence can only be
// read from what it configures the animation with — the same layering the word builder's
// suite does for the mock's missing `useReducedMotion`.
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual("react-native-reanimated/mock");
  return {
    ...mock,
    withTiming: jest.fn(mock.withTiming),
    withRepeat: jest.fn(mock.withRepeat),
  };
});

const timing = jest.mocked(withTiming);
const repeat = jest.mocked(withRepeat);

beforeEach(() => {
  timing.mockClear();
  repeat.mockClear();
});

async function renderChip(props: Partial<PokerChipHeroProps> = {}) {
  const view = await render(<PokerChipHero {...props} />);
  if (!view.root) throw new Error("the chip rendered no element tree");
  return view;
}

/** A colour as react-native-svg packs it for the native side — a signed int, the same
 * narrowing the countdown ring's suite does for its stroke. */
function packedColor(token: string) {
  const value = processColor(token);
  if (typeof value !== "number") throw new Error(`not a colour: ${token}`);
  return value | 0;
}

/** The chip's SVG circles in draw order: the gradient disc, the dashed edge, the inner ring. */
function circles(view: RenderResult) {
  return view.root!.queryAll((node: TestInstance) => typeof node.props.r === "number").map(
    (node) => node.props,
  );
}

test("draws each size's geometry: box, edge stroke, and the 60% inner ring", async () => {
  const cases = [
    { size: "sm", box: 28, border: 2 },
    { size: "md", box: 40, border: 3 },
    { size: "lg", box: 64, border: 3 },
    { size: "xl", box: 96, border: 4 },
  ] as const;

  for (const { size, box, border } of cases) {
    const view = await renderChip({ size });
    // The Svg's viewBox is extracted on the way out into vb*/min* props; width and
    // height survive as given.
    const [svg] = view
      .root!.queryAll((node: TestInstance) => typeof node.props.vbWidth === "number")
      .map((node) => node.props);
    expect(svg.width).toBe(box);
    expect(svg.height).toBe(box);
    expect(svg.vbWidth).toBe(box);
    expect(svg.vbHeight).toBe(box);

    const [disc, edge, inner] = circles(view);
    expect(disc.r).toBe(box / 2);
    // The edge stroke straddles the box's rim; the inner ring sits at 60% of the size.
    expect(edge.r).toBeCloseTo(box / 2 - border / 2, 5);
    expect(edge.strokeWidth).toBe(border);
    expect(inner.r).toBeCloseTo(box * 0.3, 5);
    // Both rings are dashed, in the border's own proportions.
    const dash = String(border * 3);
    for (const ring of [edge, inner]) {
      expect(ring.strokeDasharray).toEqual([dash, dash]);
    }
  }
});

test("each tone carries the web kit's gradient stops", async () => {
  const expected = {
    gold: ["#f5c76a", "#d4a54a", "#b8892e"],
    red: ["#c23d3d", "#8a2b2b", "#5c1a1a"],
    blue: ["#3b6cb5", "#2b4f8a", "#1a3460"],
    green: ["#4ac773", "#2c7a4f", "#1a5232"],
    purple: ["#9d56ff", "#6b3ab5", "#4c1d95"],
  } as const;

  for (const tone of Object.keys(expected) as (keyof typeof expected)[]) {
    const view = await renderChip({ tone });
    // The gradient's stops leave as one packed array — offset and colour, flattened —
    // with colours as the native side's ints, so pack the expectation the same way.
    const [gradient] = view
      .root!.queryAll((node: TestInstance) => Array.isArray(node.props.gradient))
      .map((node) => node.props.gradient as number[]);
    const [first, mid, last] = expected[tone].map(packedColor);
    expect(gradient).toEqual([0, first, 0.5, mid, 1, last]);
  }
});

test("a still chip configures no animation at all", async () => {
  await renderChip();
  expect(timing).not.toHaveBeenCalled();
  expect(repeat).not.toHaveBeenCalled();
});

test("a spinning chip turns one linear revolution a second, forever", async () => {
  await renderChip({ spinning: true });
  expect(timing).toHaveBeenCalledWith(360, { duration: 1000, easing: Easing.linear });
  expect(repeat).toHaveBeenCalledWith(360, -1, false);
});

test("reduced motion slows the spin to 1.5s a revolution rather than stopping it", async () => {
  const preference = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  try {
    const view = await renderChip({ spinning: true });
    // The hook reads the preference as a promise; let it land before judging the cadence.
    await act(async () => {
      await null;
    });

    expect(timing).toHaveBeenLastCalledWith(360, {
      duration: 1500,
      easing: Easing.linear,
    });
    expect(repeat).toHaveBeenLastCalledWith(360, -1, false);
    // Still a fully drawn chip — the preference slows the spin, it does not hide the chip.
    expect(circles(view)).toHaveLength(3);
  } finally {
    preference.mockRestore();
  }
});
