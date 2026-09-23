import { fireEvent, render, type RenderResult } from "@testing-library/react-native";
import type { Tile, TilePlay, WordScore } from "@wordpoker/contracts";
import { WORD_REJECTION_REASONS } from "@wordpoker/contracts";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { colors, opacity } from "@/constants/theme";

import { WordBuilder, WordHand, WordPreview, type WordBuilderProps } from "./word-builder";
import { WordShuffleButton } from "./shuffle-button";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the word tile reads it, so the one hook is layered on here.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/** The seat's two tiles: one plain letter, one choice tile that plays A or E (§10). */
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

/** The board as a street leaves it: a choice tile, a slot the next street fills, and a
 *  doubled letter. */
const BOARD: readonly (Tile | null)[] = [
  { id: "c-ts", letter: "T", points: 1, alternativeLetter: "S", alternativePoints: 1 },
  null,
  { id: "c-l", letter: "L", points: 1, multiplier: "double-letter" },
];

/** The draft the suite plays back: the choice tile as E, then the board's doubled L. */
const DRAFT: readonly TilePlay[] = [
  { tileId: "p-ae", chosenFace: "E" },
  { tileId: "c-l" },
];

/** §7's arithmetic for that draft: E 1 + L doubled 2, five tiles short of a full rack. */
const SCORE: WordScore = {
  letters: [
    { letter: "E", baseValue: 1, value: 1 },
    { letter: "L", baseValue: 1, multiplier: "double-letter", value: 2 },
  ],
  letterScore: 3,
  fullRackBonus: 0,
  total: 3,
};

/** The same draft with §7.3's bonus on it: all seven physical tiles played. */
const FULL_RACK: WordScore = { ...SCORE, fullRackBonus: 10, total: 13 };

/** The strip's tiles, in the order the strip draws them for those fixtures. */
const STRIP = ["p-a", "p-ae", "c-ts", "c-l"];

async function renderBuilder(overrides: Partial<WordBuilderProps> = {}) {
  const props = builderProps(overrides);
  // The placements a mode draws, in the order it draws them: the hand where the seat's
  // tiles go, the panel under the felt, and the shuffle the felt's action row would hold.
  const view = await render(
    <WordBuilder {...props}>
      <WordHand />
      <WordPreview />
      <WordShuffleButton />
    </WordBuilder>,
  );
  return { ...props, view };
}

/** The builder's own props, with the suite's fixtures and a spy for every edit it reports. */
function builderProps(overrides: Partial<WordBuilderProps> = {}) {
  const base = {
    community: BOARD,
    confirmable: true,
    confirmed: false,
    onDraft: jest.fn(),
    open: true,
    plays: [] as readonly TilePlay[],
    privateTiles: PRIVATE_TILES,
    reason: null,
    score: null,
    word: "",
  };

  return { ...base, ...overrides };
}

/**
 * The tiles as they are drawn, in order, so an arrangement — a shuffle, a drag that moved one
 * tile — is read off the screen rather than off the hook that keeps it.
 */
function stripOrder(view: RenderResult): readonly string[] {
  return view
    .getAllByTestId(/^word-builder-tile-/)
    .map((tile) => String(tile.props.testID).replace("word-builder-tile-", ""));
}

/** The letters a draft spells, as the engine would report them: one letter per tile (§10). */
function spell(community: readonly (Tile | null)[], plays: readonly TilePlay[]): string {
  const dealt = [...PRIVATE_TILES, ...community.filter((tile) => tile !== null)];

  return plays
    .flatMap((play) => {
      const tile = dealt.find((candidate) => candidate.id === play.tileId);
      if (tile === undefined) return [];
      return [play.chosenFace ?? tile.letter];
    })
    .join("");
}

/**
 * The builder as a screen holds it: the hand and the panel as a mode places them, the draft
 * living above them, and the tiles changing under them as the streets open. It stands in for a
 * mode's adapter — `@/lib/use-offline-game` is the real one — so the suite can watch an edit
 * travel out to the screen and come back in as the draft the engine reported.
 */
function Rack({ boards }: { boards: readonly (readonly (Tile | null)[])[] }) {
  const [street, setStreet] = useState(0);
  const [plays, setPlays] = useState<readonly TilePlay[]>([]);
  const community = boards[street] ?? [];

  return (
    <WordBuilder
      {...builderProps({
        community,
        onDraft: setPlays,
        plays,
        word: spell(community, plays),
      })}
    >
      <WordHand />
      <WordPreview />
      <WordShuffleButton />
      <Pressable onPress={() => setStreet((at) => at + 1)} testID="next-street" />
    </WordBuilder>
  );
}

/** Whether the shuffle is armed, as the button reports itself to assistive tech. */
function shuffleArmed(view: RenderResult): boolean {
  return view.getByTestId("word-builder-shuffle").props.accessibilityState.disabled !== true;
}

/** What the draft line paints the score in, which is how it says whether the word will count. */
function scoreColor(view: RenderResult): string | undefined {
  return StyleSheet.flatten(view.getByTestId("word-builder-score").props.style).color;
}

describe("<WordBuilder />", () => {
  test("draws every tile the seat can play as one strip, and the draft line over it", async () => {
    const { view } = await renderBuilder();

    // §7's two private tiles and the board's revealed ones, in the order they were dealt.
    expect(stripOrder(view)).toEqual(STRIP);
    expect(view.getByTestId("word-builder-tile-p-ae")).toBeOnTheScreen();
    // With nothing played there is no word yet: the line stays empty until there is one.
    expect(view.queryByTestId("word-builder-word")).toBeNull();
    // And the preview draws nothing at all — no empty sheet over the rack.
    expect(view.queryByTestId("word-preview")).toBeNull();

    // An unrevealed board slot is not a tile and holds no place in the strip.
    expect(view.queryByTestId("word-builder-board-empty-1")).toBeNull();
  });

  test("plays a tile by a tap, and a choice tile by its own face or a chip per face", async () => {
    const { onDraft, view } = await renderBuilder();

    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));
    expect(onDraft).toHaveBeenCalledWith([{ tileId: "p-a" }]);

    // A/E has no face to play on its own, so its body plays the printed first face (§10) and
    // the chips are how the other one is named.
    await fireEvent.press(view.getByTestId("word-builder-tile-p-ae"));
    expect(onDraft).toHaveBeenCalledWith([{ tileId: "p-ae", chosenFace: "A" }]);

    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-E"));
    expect(onDraft).toHaveBeenCalledWith([{ tileId: "p-ae", chosenFace: "E" }]);

    // A choice tile's body plays the face it prints first, and its chips name the other one (§10).
    await fireEvent.press(view.getByTestId("word-builder-tile-c-ts"));
    expect(onDraft).toHaveBeenCalledWith([{ tileId: "c-ts", chosenFace: "T" }]);
  });

  test("takes a played tile back out on a tap, and reads it as held while it is in", async () => {
    const { onDraft, view } = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });

    // Held tiles are the lit ones, and they say what a tap would do to them — a choice tile
    // naming the face the word is playing (§39).
    expect(view.getByTestId("word-builder-tile-p-ae").props.accessibilityLabel).toBe(
      "A or E, 1 point, playing E, in your word, tap to take it back",
    );
    expect(StyleSheet.flatten(view.getByTestId("word-builder-tile-p-ae").props.style).opacity).not.toBe(
      opacity.muted,
    );
    expect(view.getByTestId("word-builder-tile-p-a").props.accessibilityLabel).toBe(
      "A, 1 point, tap to play it",
    );
    expect(StyleSheet.flatten(view.getByTestId("word-builder-tile-p-a").props.style).opacity).toBe(
      opacity.muted,
    );

    await fireEvent.press(view.getByTestId("word-builder-tile-p-ae"));
    expect(onDraft).toHaveBeenCalledWith([{ tileId: "c-l" }]);
  });

  test("plays the other face of a choice tile that is already in the word, in place", async () => {
    const { onDraft, view } = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });

    // The chip the word is playing for is the chosen one, and naming the other face swaps it
    // where it stands: the word is E L, so naming A makes it A L.
    expect(view.getByTestId("word-builder-face-p-ae-E").props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId("word-builder-face-p-ae-A").props.accessibilityState.selected).toBe(false);

    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-A"));
    expect(onDraft).toHaveBeenCalledWith([
      { tileId: "p-ae", chosenFace: "A" },
      { tileId: "c-l" },
    ]);
  });

  test("shows the word and what §7 makes it worth, and what a refused one is worth", async () => {
    const standing = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });
    expect(standing.view.getByTestId("word-builder-word")).toHaveTextContent("EL");
    expect(standing.view.getByTestId("word-builder-score")).toHaveTextContent(/· 3pts/);
    expect(standing.view.queryByTestId("word-builder-full-rack")).toBeNull();
    expect(scoreColor(standing.view)).toBe(colors.gold);

    // §7.3's bonus is the one part of the score a seat cannot read off the tiles, so the line
    // says where it came from.
    const rack = await renderBuilder({ plays: DRAFT, score: FULL_RACK, word: "EL" });
    expect(rack.view.getByTestId("word-builder-score")).toHaveTextContent(/· 13pts/);
    expect(rack.view.getByTestId("word-builder-full-rack")).toHaveTextContent(/\+10 full rack/);

    // A draft §11 refuses scores nothing, and the number is drawn as what it is rather than
    // dropped: the seat is still shaping the word it wants to keep.
    const refused = await renderBuilder({
      plays: DRAFT,
      reason: "not-in-dictionary",
      score: SCORE,
      word: "EL",
    });
    expect(refused.view.getByTestId("word-builder-score")).toHaveTextContent(/· 3pts/);
    expect(scoreColor(refused.view)).toBe(colors.textFaint);
    expect(refused.view.getByRole("alert")).toHaveTextContent("Not in the dictionary");
  });

  test("shuffles the tiles the word does not hold, among the places they hold", async () => {
    // Fisher–Yates with the generator pinned: every tile swaps with the one before it, so the
    // shuffle is the same rearrangement every run and the order can be read off the screen.
    const random = jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { onDraft, view } = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });
      // Each tile sits where it was dealt: the word is p-ae and c-l, but neither jumps the strip.
      expect(stripOrder(view)).toEqual(["p-a", "p-ae", "c-ts", "c-l"]);

      await fireEvent.press(view.getByTestId("word-builder-shuffle"));

      // The word's own tiles keep the places they sit in — a shuffle is not an undo — and the
      // rest are dealt around them.
      expect(stripOrder(view)).toEqual(["c-ts", "p-ae", "p-a", "c-l"]);
      expect(onDraft).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  test("keeps the seat's arrangement when the tiles are dealt again under it", async () => {
    // Fisher–Yates with the generator pinned: every tile swaps with the one before it, so the
    // shuffle is the same rearrangement every run and the order can be read off the screen.
    const random = jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      const view = await render(<Rack boards={[BOARD, [...BOARD, { id: "c-z", letter: "Z", points: 10 }]]} />);

      await fireEvent.press(view.getByTestId("word-builder-shuffle"));
      expect(stripOrder(view)).toEqual(["p-ae", "c-ts", "c-l", "p-a"]);

      // A redraw that changes the tiles — the case the MVP's builder merged for — leaves the
      // seat's arrangement alone, and the street's new tile lands at the end of the strip.
      await fireEvent.press(view.getByTestId("next-street"));
      expect(stripOrder(view)).toEqual(["p-ae", "c-ts", "c-l", "p-a", "c-z"]);
    } finally {
      random.mockRestore();
    }
  });

  test("draws the tap the seat made: the tile lights up and the draft line spells it", async () => {
    const view = await render(<Rack boards={[BOARD]} />);

    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));

    // The strip's edits go back to the screen that owns the draft, and what comes back is the
    // draft the engine judged: the tile is the word's now, and the line says what it spells.
    expect(view.getByTestId("word-builder-tile-p-a").props.accessibilityLabel).toBe(
      "A, 1 point, in your word, tap to take it back",
    );
    expect(view.getByTestId("word-builder-word")).toHaveTextContent("A");
    expect(view.getByTestId("word-preview")).toBeOnTheScreen();
    expect(stripOrder(view)[0]).toBe("p-a");

    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));
    expect(view.getByTestId("word-builder-tile-p-a").props.accessibilityLabel).toBe(
      "A, 1 point, tap to play it",
    );
    // The word is gone with the tile, and so is the line that was reading it.
    expect(view.queryByTestId("word-preview")).toBeNull();
  });

  test("goes quiet once the seat confirms", async () => {
    const { onDraft, view } = await renderBuilder({
      confirmed: true,
      plays: DRAFT,
      score: SCORE,
      word: "EL",
    });

    // §19: a confirmed word is the seat's answer, so nothing here still takes a tap —
    // not the strip, and not the shuffle.
    expect(shuffleArmed(view)).toBe(false);
    const before = stripOrder(view);

    await fireEvent.press(view.getByTestId("word-builder-shuffle"));
    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));
    await fireEvent.press(view.getByTestId("word-builder-face-p-ae-A"));

    expect(stripOrder(view)).toEqual(before);
    expect(onDraft).not.toHaveBeenCalled();
  });

  test("closes the tiles when the window is shut", async () => {
    const { onDraft, view } = await renderBuilder({
      open: false,
      plays: DRAFT,
      score: SCORE,
      word: "EL",
    });

    expect(shuffleArmed(view)).toBe(false);

    await fireEvent.press(view.getByTestId("word-builder-tile-p-a"));

    expect(onDraft).not.toHaveBeenCalled();
  });

  test("arms the shuffle while there is something left to rearrange", async () => {
    // With every tile but one in the word, a shuffle has nowhere to deal: the button says so.
    const tight = await renderBuilder({
      plays: [
        { tileId: "p-a" },
        { tileId: "p-ae" },
        { tileId: "c-ts" },
      ],
      score: SCORE,
      word: "AE",
    });
    expect(shuffleArmed(tight.view)).toBe(false);

    const loose = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });
    expect(shuffleArmed(loose.view)).toBe(true);
  });

  test.each([
    ["not-in-dictionary", "Not in the dictionary"],
    ["timer-expired", "The window closed"],
    ["tile-reused", "Each tile plays once"],
  ] as const)("reads the %s refusal as a line, not a wire string", async (reason, copy) => {
    const { view } = await renderBuilder({ reason, score: SCORE, word: "EL" });

    expect(view.getByRole("alert")).toHaveTextContent(copy);
    expect(view.queryByText(reason)).toBeNull();
  });

  test("has copy for every reason the contract can send", async () => {
    for (const reason of WORD_REJECTION_REASONS) {
      const { view } = await renderBuilder({ plays: DRAFT, reason, score: SCORE, word: "EL" });
      const line = view.getByTestId("word-builder-reason").props.children;

      expect(typeof line).toBe("string");
      expect(line as string).not.toHaveLength(0);
      expect(line).not.toBe(reason);
    }
  });

  test("says nothing about a draft that still stands", async () => {
    const { view } = await renderBuilder({ plays: DRAFT, score: SCORE, word: "EL" });
    expect(view.queryByRole("alert")).toBeNull();
  });
});
