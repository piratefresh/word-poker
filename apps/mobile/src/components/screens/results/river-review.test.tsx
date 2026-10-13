import { render } from "@testing-library/react-native";

import { reviewOf, RiverReview } from "./river-review";

const tiles = [
  { id: "mine-1", letter: "A", points: 1 },
  { id: "table-1", letter: "T", points: 1 },
  { id: "table-2", letter: "S", points: 1 },
];
const words = [
  { word: "AT", score: 2, plays: [{ tileId: "mine-1" }, { tileId: "table-1" }] },
  { word: "AS", score: 2, plays: [{ tileId: "mine-1" }, { tileId: "table-2" }] },
];

describe("RiverReview", () => {
  it("lists the words best first, one row each", async () => {
    const { getByTestId, queryByTestId } = await render(
      <RiverReview available={tiles} mine={new Set(["mine-1"])} words={words} />,
    );
    expect(getByTestId("river-review-1")).toBeTruthy();
    expect(getByTestId("river-review-2")).toBeTruthy();
    expect(queryByTestId("river-review-3")).toBeNull();
  });

  it("builds props only for a seat that holds a review", () => {
    const game = { community: [tiles[1]!, null], privateTiles: [tiles[0]!] };
    expect(reviewOf(null, game)).toBeUndefined();
    expect(reviewOf(words, null)).toBeUndefined();
    const review = reviewOf(words, game);
    expect(review?.available.map((tile) => tile.id)).toEqual(["mine-1", "table-1"]);
    expect([...(review?.mine ?? [])]).toEqual(["mine-1"]);
  });
});
