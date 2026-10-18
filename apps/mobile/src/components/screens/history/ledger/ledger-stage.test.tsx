import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { withDelay, withTiming } from "react-native-reanimated";
import { LedgerStage } from "./ledger-stage";

let mockReduced = false;
jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: () => mockReduced }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useSharedValue: (value: number) => jest.requireActual("react").useState(() => ({ value }))[0],
  withTiming: jest.fn((value) => value),
  withDelay: jest.fn((delay, value) => value),
}));

function Counter({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => setCount(count + 1)}><Text>{name}: {count}</Text></Pressable>;
}

function Stage({ open }: { open: boolean }) {
  return <LedgerStage open={open} home={<Counter name="Home" />}><Counter name="Page" /></LedgerStage>;
}

beforeEach(() => { mockReduced = false; jest.clearAllMocks(); });

test("reduced motion swaps instantly, preserves Home state and resets pages after closing", async () => {
  mockReduced = true;
  const view = await render(<Stage open={false} />);
  await fireEvent.press(view.getByRole("button", { name: "Home" }));
  await view.rerender(<Stage open />);
  await fireEvent.press(view.getByRole("button", { name: "Page" }));
  expect(view.getByText("Page: 1")).toBeOnTheScreen();
  expect(view.getByTestId("ledger-pages").props.pointerEvents).toBe("auto");
  expect(withTiming).not.toHaveBeenCalled();
  expect(withDelay).not.toHaveBeenCalled();
  for (const face of ["ledger-cover-front", "ledger-cover-back"]) {
    expect(view.getByTestId(face, { includeHiddenElements: true }).props.importantForAccessibility).toBe("no-hide-descendants");
  }
  await view.rerender(<Stage open={false} />);
  expect(view.getByTestId("ledger-book", { includeHiddenElements: true }).props.pointerEvents).toBe("none");
  expect(view.getByText("Home: 1")).toBeOnTheScreen();
  expect(view.queryByText("Page: 1", { includeHiddenElements: true })).toBeNull();
  await view.rerender(<Stage open />);
  expect(view.getByText("Page: 0")).toBeOnTheScreen();
});

test("stages the drop, swing and close timings and gates page input before the spine", async () => {
  const view = await render(<Stage open={false} />);
  jest.mocked(withDelay).mockClear();
  await view.rerender(<Stage open />);
  expect(withDelay).toHaveBeenCalledWith(550, -176);
  expect(withTiming).toHaveBeenCalledWith(-176, expect.objectContaining({ duration: 800 }));
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 650 }), expect.any(Function));
  expect(view.getByTestId("ledger-pages", { includeHiddenElements: true }).props.pointerEvents).toBe("none");
  await view.rerender(<Stage open={false} />);
  expect(withDelay).toHaveBeenCalledWith(600, 0);
});
