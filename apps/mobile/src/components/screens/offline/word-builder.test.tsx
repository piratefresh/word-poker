import { fireEvent, render, type RenderResult } from "@testing-library/react-native";
import type { Tile, TilePlay } from "@wordpoker/contracts";
import { WORD_REJECTION_REASONS } from "@wordpoker/contracts";
import { StyleSheet } from "react-native";

import { opacity } from "@/constants/theme";

import { WordBuilder, type WordBuilderProps } from "./word-builder";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the word tile reads it, so the one hook is layered on here.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/** The hero's two tiles: one plain letter, one choice tile that plays A or E (§10). */
const PRIVATE_TILES: readonly Tile[] = [
  { id: "p-a", letter: "A", points: 1 },
  {
    id: "p-ae",
    letter: "A",
    points: 1,
    alternativeLetter: "E",
    alternativePoints: 1,
  },
];

/** The board as a street leaves it: a sequence tile, a slot the next street fills, and a
 *  doubled letter. */
const BOARD: readonly (Tile | null)[] = [
  { id: "c-th", letter: "T", points: 1, sequenceLetter: "H", sequencePoints: 4 },
  null,
  { id: "c-l", letter: "L", points: 1, multiplier: "double-letter" },
];

/** The draft the suite plays back: the choice tile as E, then the board's sequence tile. */
const DRAFT: readonly TilePlay[] = [
  { tileId: "p-ae", chosenFace: "E" },
  { tileId: "c-th" },
];

async function renderBuilder(overrides: Partial<WordBuilderProps> = {}) {
  const onPlay = jest.fn();
  const onRemove = jest.fn();
  const onClear = jest.fn();
  const onConfirm = jest.fn();
  const view = await render(
    <WordBuilder
      community={BOARD}
      confirmed={false}
      dictionaryLabel="TWL"
      onClear={onClear}
      onConfirm={onConfirm}
      onPlay={onPlay}
      onRemove={onRemove}
      open
      plays={[]}
      privateTiles={PRIVATE_TILES}
      reason={null}
      word=""
      {...overrides}
    />,
  );
  return { onClear, onConfirm, onPlay, onRemove, view };
}

/**
 * `@expo/ui`'s buttons are native controls: the adapter view carries no text node, so a
 * control is located by the `testID` it was given and located as disabled by the flag the
 * native control receives. The adapter does not enforce `disabled` under Jest — the screen
 * passes no handler for a disabled control — so the flag is what is asserted here.
 */
function expectControlDisabled(view: RenderResult, testID: string) {
  expect(disabledFlag(view, testID)).toBe(true);
}

function expectControlEnabled(view: RenderResult, testID: string) {
  expect(disabledFlag(view, testID)).toBe(false);
}

function disabledFlag(view: RenderResult, testID: string) {
  const { modifiers } = view.getByTestId(testID).props;
  return (modifiers as readonly { $type?: string; disabled?: boolean }[]).some(
    (modifier) => modifier.$type === "disabled" && modifier.disabled === true,
  );
}

describe("<WordBuilder />", () => {
  test("names the dictionary before the seat plays, and says nothing without one", async () => {
    const named = await renderBuilder({ dictionaryLabel: "SOWPODS" });
    expect(named.view.getByText("SOWPODS")).toBeOnTheScreen();
    expect(named.view.getByText("Words must be in this list to count")).toBeOnTheScreen();

    const unnamed = await renderBuilder({ dictionaryLabel: null });
    expect(unnamed.view.queryByText("SOWPODS")).toBeNull();
    expect(unnamed.view.queryByText(/this list/)).toBeNull();
  });

  test("prompts for the first play, then shows the word it spells", async () => {
    const empty = await renderBuilder();
    expect(empty.view.getByText("Drag a tile into this band, or tap it to play it")).toBeOnTheScreen();
    expect(empty.view.queryByTestId("word-builder-word")).toBeNull();

    const building = await renderBuilder({ plays: DRAFT, word: "ETH" });
    expect(building.view.queryByText("Tap a tile to start your word")).toBeNull();
    expect(building.view.getByTestId("word-builder-word")).toHaveTextContent("ETH");
    expect(building.view.getByTestId("word-builder-plays")).toBeOnTheScreen();
  });

  test("plays a rack tile by its id, and a choice tile by a chip per face", async () => {
    const { onPlay, view } = await renderBuilder();

    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));
    expect(onPlay).toHaveBeenCalledWith("p-a");

    // A/E plays one letter at a time (§10), so the tile itself names no face to play.
    expect(view.queryByRole("button", { name: "A or E, 1 point" })).toBeNull();
    expect(view.getByRole("image", { name: "A or E, 1 point" })).toBeOnTheScreen();

    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-A"));
    expect(onPlay).toHaveBeenCalledWith("p-ae", "A");

    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-E"));
    expect(onPlay).toHaveBeenCalledWith("p-ae", "E");

    // A sequence tile plays itself, both letters in the printed order.
    await fireEvent.press(view.getByTestId("word-builder-tile-c-th"));
    expect(onPlay).toHaveBeenCalledWith("c-th");
  });

  test("takes a play back by its index, drawing the face the play chose", async () => {
    const { onRemove, view } = await renderBuilder({ plays: DRAFT, word: "ETH" });

    // Only the chosen face is drawn: the row says E, not A/E.
    expect(view.getByTestId("word-builder-play-0").props.accessibilityLabel).toContain(
      "E, 1 point",
    );
    expect(view.getByTestId("word-builder-play-0").props.accessibilityLabel).not.toContain(
      "A or E",
    );
    expect(view.getByTestId("word-builder-play-1").props.accessibilityLabel).toContain(
      "T then H",
    );
    expect(view.getByTestId("word-builder-play-0").props.accessibilityLabel).toContain(
      "tap to take it back",
    );

    await fireEvent.press(view.getByTestId("word-builder-play-0"));
    expect(onRemove).toHaveBeenCalledWith(0);

    await fireEvent.press(view.getByTestId("word-builder-play-1"));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test("does not offer a tile the draft already spent", async () => {
    const { onPlay, view } = await renderBuilder({
      plays: [{ tileId: "p-a" }, { tileId: "p-ae", chosenFace: "A" }],
      word: "AA",
    });

    // §11: each physical tile plays once. The spent tiles stay on screen — the seat has to
    // see which tile the word already used — but they are faded out and off the rack.
    const spent = view.getByTestId("word-builder-tile-p-a");
    expect(spent).toBeOnTheScreen();
    expect(StyleSheet.flatten(spent.props.style).opacity).toBe(opacity.muted);
    expect(view.queryByRole("button", { name: "A, 1 point" })).toBeNull();

    await fireEvent.press(spent);
    expect(onPlay).not.toHaveBeenCalled();

    const spentChoice = view.getByTestId("word-builder-tile-p-ae");
    expect(spentChoice).toBeOnTheScreen();
    expect(view.getByTestId("word-builder-face-p-ae-A")).toBeDisabled();
    expect(view.getByTestId("word-builder-face-p-ae-E")).toBeDisabled();

    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-A"));
    await fireEvent.press(spentChoice);
    expect(onPlay).not.toHaveBeenCalled();
  });

  test.each([
    ["not-in-dictionary", "Not in the dictionary"],
    ["two-letter-split", "A two-letter tile keeps its letters together"],
    ["timer-expired", "The window closed"],
    ["tile-reused", "Each tile plays once"],
  ] as const)("reads the %s refusal as a line, not a wire string", async (reason, copy) => {
    const { view } = await renderBuilder({ reason });

    expect(view.getByRole("alert")).toHaveTextContent(copy);
    expect(view.queryByText(reason)).toBeNull();
  });

  test("has copy for every reason the contract can send", async () => {
    for (const reason of WORD_REJECTION_REASONS) {
      const { view } = await renderBuilder({ reason });
      const line = view.getByTestId("word-builder-reason").props.children;

      expect(typeof line).toBe("string");
      expect(line as string).not.toHaveLength(0);
      expect(line).not.toBe(reason);
    }
  });

  test("says nothing about a draft that still stands", async () => {
    const { view } = await renderBuilder({ plays: [{ tileId: "p-a" }], word: "A" });
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("locks the draft once the seat confirms", async () => {
    const { onClear, onConfirm, onRemove, view } = await renderBuilder({
      confirmed: true,
      plays: [{ tileId: "p-a" }],
      word: "A",
    });

    expect(view.getByText("Confirmed — locked")).toBeOnTheScreen();
    // A locked play is not a control, and it does not read like one.
    expect(
      view.getByTestId("word-builder-play-0").props.accessibilityLabel,
    ).not.toContain("take it back");

    // §19: a confirmed word is the seat's answer, so nothing here still takes a tap.
    const confirm = view.getByTestId("word-builder-confirm");
    const clear = view.getByTestId("word-builder-clear");
    expectControlDisabled(view, "word-builder-confirm");
    expectControlDisabled(view, "word-builder-clear");

    await fireEvent.press(confirm);
    await fireEvent.press(clear);
    await fireEvent.press(view.getByTestId("word-builder-play-0"));
    await fireEvent.press(view.getByTestId("word-builder-tile-c-th"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  test("closes the controls when the window is shut", async () => {
    const { onClear, onConfirm, onPlay, view } = await renderBuilder({
      open: false,
      plays: [{ tileId: "p-a" }],
      word: "A",
    });

    expect(view.queryByText("Confirmed — locked")).toBeNull();

    const confirm = view.getByTestId("word-builder-confirm");
    const clear = view.getByTestId("word-builder-clear");
    expectControlDisabled(view, "word-builder-confirm");
    expectControlDisabled(view, "word-builder-clear");

    await fireEvent.press(confirm);
    await fireEvent.press(clear);
    await fireEvent.press(view.getByTestId("word-builder-tile-c-th"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  test("clears and confirms the draft it was handed", async () => {
    const { onClear, onConfirm, view } = await renderBuilder({
      plays: [{ tileId: "p-a" }],
      word: "A",
    });

    await fireEvent.press(view.getByTestId("word-builder-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId("word-builder-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);

    // The flag is read off the control's state, not always present: a live window with a
    // draft to clear leaves both controls armed.
    expectControlEnabled(view, "word-builder-confirm");
    expectControlEnabled(view, "word-builder-clear");
  });

  test("holds the draft's own clear until something is played", async () => {
    const { onClear, view } = await renderBuilder();

    const clear = view.getByTestId("word-builder-clear");
    expectControlDisabled(view, "word-builder-clear");

    await fireEvent.press(clear);
    expect(onClear).not.toHaveBeenCalled();
  });

  test("draws the board's unrevealed slots as holes, not tiles", async () => {
    const { view } = await renderBuilder();

    expect(view.getByTestId("word-builder-tile-c-th")).toBeOnTheScreen();
    expect(view.getByTestId("word-builder-tile-c-l")).toBeOnTheScreen();
    expect(view.getByTestId("word-builder-board-empty-1")).toBeOnTheScreen();
    expect(view.queryByTestId("word-builder-board-empty-0")).toBeNull();
  });
});
