import { render, type RenderResult } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { opacity } from "@/constants/theme";

import { TileLogo } from "./tile-logo";

// The suite's reanimated mock has no `useReducedMotion`, and the logo reads it.
let mockReduceMotion = false;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => mockReduceMotion,
}));

/**
 * The W tile's wrapper style: the mock draws the animated style as it stood at first render.
 * Tiles are hidden from screen readers, so the query includes hidden elements; the JSON round
 * trip folds a home offset's `-0` into `0`.
 */
function firstTile(view: RenderResult): { opacity: number; transform: unknown[] } {
  const tile = view.getByTestId("tile-logo-WORD-0", { includeHiddenElements: true });
  return JSON.parse(JSON.stringify(StyleSheet.flatten(tile.props.style)));
}

const HOME = [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 1 }];

// Order matters: the intro is once per module (app session), and reduced motion never plays it.
test("reduced motion renders the finished logo", async () => {
  mockReduceMotion = true;
  const view = await render(<TileLogo width={360} />);

  expect(view.getByLabelText("Word Poker")).toBeTruthy();
  expect(firstTile(view)).toMatchObject({ opacity: 1, transform: HOME });
});

test("plays the intro once per session, then shows the finished logo", async () => {
  mockReduceMotion = false;
  const first = await render(<TileLogo width={360} />);
  const start = firstTile(first);

  expect(start.opacity).toBe(opacity.muted);
  expect(start.transform).not.toEqual(HOME);
  first.unmount();

  const again = await render(<TileLogo width={360} />);
  expect(firstTile(again)).toMatchObject({ opacity: 1, transform: HOME });
});
