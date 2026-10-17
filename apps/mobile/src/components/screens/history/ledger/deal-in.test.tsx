import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { withDelay, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { DealIn } from "./deal-in";

jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: jest.fn() }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  // The shipped mock creates a new object each render; native shared values are stable.
  useSharedValue: (value: number) => jest.requireActual("react").useState(() => ({ value }))[0],
  withTiming: jest.fn((value) => value),
  withDelay: jest.fn((delay, value) => value),
}));

test("reduced motion renders at rest without scheduling entrance animations", async () => {
  jest.mocked(useReduceMotion).mockReturnValue(true);
  jest.mocked(withTiming).mockClear();
  const screen = await render(<DealIn index={8}><Text>Hand</Text></DealIn>);
  expect(screen.getByText("Hand")).toBeOnTheScreen();
  expect(screen.toJSON()).toMatchObject({ props: { style: { opacity: 1, transform: [{ translateY: 0 }, { rotate: "0deg" }] } } });
  expect(withTiming).not.toHaveBeenCalled();
});

test("caps stagger and replays on page activation, without replaying on rerender", async () => {
  jest.mocked(useReduceMotion).mockReturnValue(false);
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

test("stays hidden while inactive until its first deal", async () => {
  jest.mocked(useReduceMotion).mockReturnValue(false);
  jest.mocked(withTiming).mockClear();
  const screen = await render(<DealIn index={0} active={false}><Text>Hand</Text></DealIn>);
  expect(screen.toJSON()).toMatchObject({ props: { style: { opacity: 0 } } });
  expect(withTiming).not.toHaveBeenCalled();
  await screen.rerender(<DealIn index={0}><Text>Hand</Text></DealIn>);
  expect(withTiming).toHaveBeenCalledTimes(2);
});
