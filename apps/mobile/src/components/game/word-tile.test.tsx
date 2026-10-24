import { render } from "@testing-library/react-native";
import type { Tile as TileData } from "@wordpoker/contracts";

import { Tile, getTileAccessibilityLabel } from "./word-tile";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO —
// and the tile reads it, so the one hook is layered on here.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

/** §10's A/E pair, and the single letter it is told apart from. */
const CHOICE: TileData = {
  id: "AE-1",
  letter: "A",
  points: 1,
  alternativeLetter: "E",
  alternativePoints: 1,
};
const PLAIN: TileData = { id: "A-1", letter: "A", points: 1 };

describe("<Tile /> — §10's choice tiles", () => {
  test("wears an accent a single letter does not", async () => {
    // The accent sits inside the tile's face, which is hidden from assistive tech — the tile's
    // own label is what a reader gets — so the query has to say so.
    const choice = await render(<Tile side="front" tile={CHOICE} />);
    expect(choice.queryByTestId("tile-choice-accent", { includeHiddenElements: true })).toBeOnTheScreen();

    const plain = await render(<Tile side="front" tile={PLAIN} />);
    expect(plain.queryByTestId("tile-choice-accent", { includeHiddenElements: true })).toBeNull();
  });

  test("prints only the face the word plays, once a face is picked (§10)", async () => {
    // The face's letters and values live inside the tile's face, which is hidden from assistive
    // tech — the tile's own label is what a reader gets — so the queries have to say so.
    const hidden = { includeHiddenElements: true } as const;

    // Nothing picked: the tile prints "?" under its MULTI strip, and the pair's one value.
    const open = await render(<Tile side="front" tile={CHOICE} />);
    expect(open.getByText("?", hidden)).toBeOnTheScreen();
    expect(open.getByText("MULTI", hidden)).toBeOnTheScreen();
    expect(open.queryByText("A", hidden)).toBeNull();
    expect(open.getByText("1", hidden)).toBeOnTheScreen();

    // Played as E: the tile prints E alone, worth its own value, with no other letter or value.
    const chosen = await render(<Tile chosenFace="E" side="front" tile={CHOICE} />);
    expect(chosen.getByText("E", hidden)).toBeOnTheScreen();
    expect(chosen.queryByText("A", hidden)).toBeNull();
    expect(chosen.queryByText("/", hidden)).toBeNull();
    expect(chosen.getByText("1", hidden)).toBeOnTheScreen();
    // The accent stays: the tile is still a choice tile, and the chips name the other face.
    expect(chosen.getByTestId("tile-choice-accent", hidden)).toBeOnTheScreen();

    // A pair whose faces are worth different amounts prints the played face's own value (§10).
    const king = await render(
      <Tile
        chosenFace="K"
        side="front"
        tile={{ id: "QK-1", letter: "Q", points: 10, alternativeLetter: "K", alternativePoints: 5 }}
      />,
    );
    expect(king.getByText("K", hidden)).toBeOnTheScreen();
    expect(king.getByText("5", hidden)).toBeOnTheScreen();
    expect(king.queryByText("10", hidden)).toBeNull();
  });

  test("reads both faces aloud, and what each is worth (§39)", () => {
    expect(getTileAccessibilityLabel(CHOICE)).toBe("A or E, 1 point");
    expect(getTileAccessibilityLabel(PLAIN)).toBe("A, 1 point");
    // §9: the multiplier rides on the physical tile, and it is part of what a reader hears.
    expect(getTileAccessibilityLabel({ ...CHOICE, multiplier: "double-letter" })).toBe(
      "A or E, 1 point, double letter",
    );
    // A pair whose faces are worth different amounts reads both values, in printed order.
    expect(
      getTileAccessibilityLabel({ id: "QK-1", letter: "Q", points: 10, alternativeLetter: "K", alternativePoints: 5 }),
    ).toBe("Q or K, 10 or 5 points");
  });
});
