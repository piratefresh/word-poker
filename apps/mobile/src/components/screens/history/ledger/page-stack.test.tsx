import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { withTiming } from "react-native-reanimated";
import { PageStack } from "./page-stack";

let mockReduced = false;
jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: () => mockReduced }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useSharedValue: (value: number) => jest.requireActual("react").useState(() => ({ value }))[0],
  withTiming: jest.fn((value) => value),
}));

function Page({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return <Pressable accessibilityLabel={name} onPress={() => setCount(count + 1)}><Text>{name}: {count}</Text></Pressable>;
}
function Book({ level, session = "a", hand = "a" }: { level: number; session?: string; hand?: string }) {
  return <PageStack level={level}>{[
    <Page key="sessions" name="Sessions" />,
    <Page key={session} name="Hands" />,
    <Page key={hand} name="Detail" />,
  ]}</PageStack>;
}

beforeEach(() => { mockReduced = false; jest.clearAllMocks(); });

test("a cold detail entry starts with its ancestors already turned", async () => {
  await render(<Book level={2} />);
  expect(withTiming).not.toHaveBeenCalled();
});

test("keeps page state across turns, resets only a different selection, and hides inactive pages", async () => {
  const view = await render(<Book level={1} />);
  await fireEvent.press(view.getByLabelText("Hands"));
  await view.rerender(<Book level={2} />);
  expect(view.queryByLabelText("Hands")).toBeNull();
  expect(view.getByTestId("history-page-1", { includeHiddenElements: true }).props.pointerEvents).toBe("none");
  await view.rerender(<Book level={1} />);
  expect(view.getByText("Hands: 1")).toBeTruthy();
  await view.rerender(<Book level={1} session="b" />);
  expect(view.getByText("Hands: 0")).toBeTruthy();
  expect(withTiming).toHaveBeenCalledWith(-176, expect.objectContaining({ duration: 750 }));
});

test("Reduce Motion keeps the same page instances and swaps without scheduling a turn", async () => {
  mockReduced = true;
  const view = await render(<Book level={1} />);
  await fireEvent.press(view.getByLabelText("Hands"));
  await view.rerender(<Book level={2} />);
  await view.rerender(<Book level={1} />);
  expect(view.getByText("Hands: 1")).toBeTruthy();
  expect(withTiming).not.toHaveBeenCalled();
});
