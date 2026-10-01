import { render } from "@testing-library/react-native";
import { act } from "react";
import { AccessibilityInfo } from "react-native";
import { Easing, withRepeat, withTiming } from "react-native-reanimated";


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

test("keeps the chip sizes and colors when using the atlas", async () => {
  for (const [size, box] of [["sm", 28], ["md", 40], ["lg", 64], ["xl", 96]] as const) {
    const view = await renderChip({ size, tone: "purple" });
    const sprite = view.root!.queryAll((node) => node.props.contentFit === "fill")[0];
    expect(sprite.props.style.width).toBeCloseTo(1254 * box / 198);
    expect(sprite.props.style.top).toBeCloseTo(-743 * box / 198);
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
    expect(view.root!.queryAll((node) => node.props.contentFit === "fill").length).toBeGreaterThan(0);
  } finally {
    preference.mockRestore();
  }
});
