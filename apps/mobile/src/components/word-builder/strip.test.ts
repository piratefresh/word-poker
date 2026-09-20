import type { TilePlay } from "@wordpoker/contracts";

import {
  inStripOrder,
  move,
  orderFromPositions,
  sameDraft,
  shuffleUnheld,
  type StripEntry,
} from "./strip";

/**
 * The strip's model, away from the screen: what a drag means, and what the draft it leaves
 * behind is. The gesture itself belongs to `react-native-reanimated-dnd` and a drop never
 * reaches a test runner, so what is pinned here is the part the builder owns — the order.
 */

/** The seat's two tiles and the board's, as the strip holds them. */
const ENTRIES: readonly StripEntry[] = [
  { tile: { id: "p-a", letter: "A", points: 1 }, ownership: "private" },
  { tile: { id: "p-r", letter: "R", points: 2 }, ownership: "private" },
  { tile: { id: "c-th", letter: "T", points: 1, sequenceLetter: "H", sequencePoints: 4 }, ownership: "community" },
  { tile: { id: "c-z", letter: "Z", points: 10 }, ownership: "community" },
];

/** The word the seat has built: A then R, which is those two tiles' order in the strip. */
const DRAFT: readonly TilePlay[] = [{ tileId: "p-a" }, { tileId: "p-r" }];

const ids = (entries: readonly StripEntry[]): readonly string[] =>
  entries.map((entry) => entry.tile.id);

const plays = (draft: readonly TilePlay[]): readonly string[] =>
  draft.map((play) => play.tileId);

describe("the strip's order", () => {
  test("moves a tile to the place it was dropped on, and only there", () => {
    expect(ids(move(ENTRIES, 0, 2))).toEqual(["p-r", "c-th", "p-a", "c-z"]);
    expect(ids(move(ENTRIES, 3, 0))).toEqual(["c-z", "p-a", "p-r", "c-th"]);

    // A place the strip has not got — the drag began when the hand was longer — is the order it
    // already had, never a throw and never a tile lost.
    expect(ids(move(ENTRIES, 0, 9))).toEqual(ids(ENTRIES));
    expect(ids(move(ENTRIES, -1, 1))).toEqual(ids(ENTRIES));
    expect(ids(move(ENTRIES, 2, 2))).toEqual(ids(ENTRIES));
  });

  test("reads a drop's places back into the order they describe", () => {
    // The kit hands back `{ id: place }`; the strip is the ids sorted by the place they landed on.
    expect(orderFromPositions({ "p-a": 2, "p-r": 0, "c-th": 3, "c-z": 1 })).toEqual([
      "p-r",
      "c-z",
      "p-a",
      "c-th",
    ]);
  });

  test("reads the draft off the strip, in the strip's order", () => {
    expect(plays(inStripOrder(ENTRIES, DRAFT))).toEqual(["p-a", "p-r"]);
    // The word follows the strip, so putting the strip in the other order turns the word around
    // rather than being ignored.
    expect(plays(inStripOrder([...ENTRIES].reverse(), DRAFT))).toEqual(["p-r", "p-a"]);
    // A tile the word does not hold contributes nothing, wherever it sits.
    expect(plays(inStripOrder(ENTRIES, [{ tileId: "c-z" }]))).toEqual(["c-z"]);
  });

  test("tells one submission from another", () => {
    expect(sameDraft(DRAFT, [{ tileId: "p-a" }, { tileId: "p-r" }])).toBe(true);
    expect(sameDraft(DRAFT, [{ tileId: "p-r" }, { tileId: "p-a" }])).toBe(false);
    expect(sameDraft(DRAFT, [{ tileId: "p-a" }])).toBe(false);
    expect(sameDraft([{ tileId: "p-a" }], [{ tileId: "p-a", chosenFace: "E" }])).toBe(false);
  });

  test("shuffles the tiles the word does not hold, and leaves the held ones where they sit", () => {
    // Fisher–Yates with the generator pinned swaps every tile with the one before it.
    const random = jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      const held = new Set(["p-a", "c-th"]);
      const shuffled = shuffleUnheld(ENTRIES, held);

      // p-a and c-th keep the places they sit in (0 and 2); p-r and c-z are dealt around them.
      expect(ids(shuffled)).toEqual(["p-a", "c-z", "c-th", "p-r"]);
      // Every tile is still there, so a shuffle never loses one.
      expect([...ids(shuffled)].sort()).toEqual([...ids(ENTRIES)].sort());
    } finally {
      random.mockRestore();
    }
  });
});
