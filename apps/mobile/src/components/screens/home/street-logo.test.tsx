import { render, type RenderResult } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { opacity } from "@/constants/theme";

import { StreetLogo } from "./street-logo";

jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));
let mockReduceMotion = true;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => mockReduceMotion,
}));

function firstTile(view: RenderResult) {
  return StyleSheet.flatten(view.getByTestId("street-logo-motion-WORD-0", { includeHiddenElements: true }).props.style);
}

test("reduced motion shows the finished permanent title", async () => {
  const view = await render(<StreetLogo width={280} />);
  expect(view.getByRole("header", { name: "Word Poker" })).toBeTruthy();
  expect(firstTile(view)).toMatchObject({ opacity: 1 });
  expect(firstTile(view).transform).toContainEqual({ rotate: "-4deg" });
  expect(view.queryByTestId("tile-logo-rack")).toBeNull();
});

test("plays the original scatter entrance once, then returns to the finished title", async () => {
  mockReduceMotion = false;
  const first = await render(<StreetLogo width={280} />);
  expect(firstTile(first)).toMatchObject({ opacity: opacity.muted });
  first.unmount();

  const again = await render(<StreetLogo width={280} />);
  expect(firstTile(again)).toMatchObject({ opacity: 1 });
  expect(firstTile(again).transform).toContainEqual({ rotate: "-4deg" });
});
