import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { useReducedMotion, withDelay, withTiming } from "react-native-reanimated";
import { DealIn } from "./deal-in";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useReducedMotion: jest.fn(),
  // The shipped mock creates a new object each render; native shared values are stable.
  useSharedValue: (value: number) => jest.requireActual("react").useState(() => ({ value }))[0],
  withTiming: jest.fn((value) => value),
  withDelay: jest.fn((delay, value) => value),
}));

test("reduced motion renders at rest without scheduling entrance animations", async () => {
  jest.mocked(useReducedMotion).mockReturnValue(true);
  jest.mocked(withTiming).mockClear();
  const screen = await render(<DealIn index={8}><Text>Hand</Text></DealIn>);
  expect(screen.getByText("Hand")).toBeOnTheScreen();
  expect(screen.toJSON()).toMatchObject({ props: { style: { opacity: 1, transform: [{ translateY: 0 }, { rotate: "0deg" }] } } });
  expect(withTiming).not.toHaveBeenCalled();
});

test("caps stagger and replays on page activation, without replaying on rerender", async () => {
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(withTiming).mockClear();
  jest.mocked(withDelay).mockClear();
  const screen = await render(<DealIn index={199} baseDelay={100}><Text>Hand</Text></DealIn>);
  expect(withDelay).toHaveBeenCalledWith(595, 1);
  expect(withTiming).toHaveBeenCalledTimes(2);
  await screen.rerender(<DealIn index={199} baseDelay={100}><Text>Updated hand</Text></DealIn>);
  expect(withTiming).toHaveBeenCalledTimes(2);
  await screen.rerender(<DealIn index={199} baseDelay={100} active={false}><Text>Hand</Text></DealIn>);
  await screen.rerender(<DealIn index={199} baseDelay={100}><Text>Hand</Text></DealIn>);
  expect(withTiming).toHaveBeenCalledTimes(4);
});
