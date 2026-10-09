import { render, type RenderResult } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { opacity } from "@/constants/theme";

import {
  createDictionary,
  type DictionaryArtifact,
} from "@wordpoker/game-rules";

import { orderAt, TileLogo, WORD_POOL } from "./tile-logo";

jest.mock("expo-router", () => ({ useFocusEffect: jest.fn() }));

test("every idle word is in the dictionary, starts unsorted, and its swaps spell it", () => {
  // Jest can't run the shipped loader's dynamic import, so build the same dictionary from its JSON.
  const dictionary = createDictionary(
    jest.requireActual<DictionaryArtifact>(
      "../../../../../../packages/game-rules/data/en_US-large.json",
    ),
  );
  for (const entry of WORD_POOL) {
    const { word, start, sorts } = entry;
    expect(word.length).toBeGreaterThanOrEqual(2);
    expect(word.length).toBeLessThanOrEqual(7);
    expect(dictionary.isWord(word)).toBe(true);
    // The start is the word's own tiles, unsorted, and the swaps sort it back.
    expect([...start].sort().join("")).toBe([...word].sort().join(""));
    expect(start).not.toBe(word);
    expect([...entry.activate].sort((x, y) => x - y)).toEqual(
      [...start].map((_, i) => i),
    );
    expect(
      orderAt(entry, word.length + sorts.length)
        .map((tile) => start[tile])
        .join(""),
    ).toBe(word);
  }
  // The loop walks the pool in order and wraps, so a repeat needs a duplicate entry.
  expect(new Set(WORD_POOL.map((e) => e.word)).size).toBe(WORD_POOL.length);
});

// The suite's reanimated mock has no `useReducedMotion`, and the logo reads it.
let mockReduceMotion = false;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock",
  ),
  useReducedMotion: () => mockReduceMotion,
}));

/**
 * The W tile's wrapper style: the mock draws the animated style as it stood at first render.
 * Tiles are hidden from screen readers, so the query includes hidden elements; the JSON round
 * trip folds a home offset's `-0` into `0`.
 */
function firstTile(view: RenderResult): {
  opacity: number;
  transform: unknown[];
} {
  const tile = view.getByTestId("tile-logo-WORD-0", {
    includeHiddenElements: true,
  });
  return JSON.parse(JSON.stringify(StyleSheet.flatten(tile.props.style)));
}

const HOME = [
  { translateX: 0 },
  { translateY: 0 },
  { rotate: "0deg" },
  { scale: 1 },
];

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
