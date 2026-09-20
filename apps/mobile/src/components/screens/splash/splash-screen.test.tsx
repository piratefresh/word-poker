import { act, render } from "@testing-library/react-native";

import { SplashScreen } from "./splash-screen";

// The chip has its own suite; what this screen owns is mounting it as the web splash
// does — gold, lg, spinning — so the mock stands in and reports exactly that.
jest.mock("@/components/ui/poker-chip-hero", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    PokerChipHero: (props: Record<string, unknown>) =>
      React.createElement(View, { testID: "splash-chip", ...props }),
  };
});

/** Advances the fake clock the way the turn clock's suite does — an async act, so every
 * effect the render deferred flushes before the assertion reads what it scheduled. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("shows the wordmark, the tagline, and the spinning gold chip", async () => {
  const view = await render(<SplashScreen />);

  expect(view.getByText("Word\nPoker")).toBeTruthy();
  expect(view.getByText(/build words · win pots/i)).toBeTruthy();

  const chip = view.getByTestId("splash-chip").props;
  expect(chip).toMatchObject({ tone: "gold", size: "lg", spinning: true });
});

test("advances on its own after two seconds by default", async () => {
  const onComplete = jest.fn();
  await render(<SplashScreen onComplete={onComplete} />);

  await advance(1999);
  expect(onComplete).not.toHaveBeenCalled();

  await advance(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("honours a custom advance window", async () => {
  const onComplete = jest.fn();
  await render(<SplashScreen onComplete={onComplete} autoAdvanceMs={500} />);

  await advance(499);
  expect(onComplete).not.toHaveBeenCalled();

  await advance(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("tears the timer down when it unmounts before the window closes", async () => {
  const onComplete = jest.fn();
  const view = await render(<SplashScreen onComplete={onComplete} />);

  await view.unmount();
  await advance(10_000);
  expect(onComplete).not.toHaveBeenCalled();
});
