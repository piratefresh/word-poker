import {
  KITCHEN_TABLE,
  chapterStars,
  coachFor,
  discSize,
  nodeState,
  pathTiles,
  previewProgress,
  type ChapterProgress,
  type MapNodeId,
} from "./kitchen-table-map";

const node = (id: MapNodeId) => KITCHEN_TABLE.nodes.find((entry) => entry.id === id)!;
const states = (progress: ChapterProgress) =>
  Object.fromEntries(KITCHEN_TABLE.nodes.map((entry) => [entry.id, nodeState(entry, progress)]));

test("a fresh chapter opens only the first hand", () => {
  expect(states({})).toEqual({
    "first-hand": "available",
    "chips-on-the-table": "locked",
    "word-wizard": "locked",
    bonus: "locked",
    professor: "locked",
  });
});

test("a hand lost for 0 stars still counts as cleared and opens the next", () => {
  expect(nodeState(node("chips-on-the-table"), { "first-hand": 0 })).toBe("available");
});

test("the third hand opens the bonus and the boss together", () => {
  const progress = previewProgress(3);
  expect(nodeState(node("bonus"), progress)).toBe("available");
  expect(nodeState(node("professor"), progress)).toBe("available");
  expect(coachFor(progress).node.id).toBe("professor");
});

test("the boss can be beaten with the bonus skipped", () => {
  const progress = { ...previewProgress(3), professor: 2 };
  expect(nodeState(node("bonus"), progress)).toBe("available");
  expect(coachFor(progress).line).toMatch(/The Local/);
});

test("stars add up to the chapter total", () => {
  expect(chapterStars(previewProgress(5))).toBe(12);
  expect(chapterStars({})).toBe(0);
});

test("the coach points at each hand in turn", () => {
  expect([0, 1, 2].map((step) => coachFor(previewProgress(step)).friend)).toEqual(["ellis", "jay", "mira"]);
});

test("the tile path never sits under a disc, and lights up as the player walks it", () => {
  const tiles = pathTiles({});
  for (const entry of KITCHEN_TABLE.nodes) {
    const radius = discSize(entry) / 2;
    expect(tiles.some((tile) => Math.hypot(tile.x - entry.x, tile.y - entry.y) < radius)).toBe(false);
  }
  const lit = (step: number) => pathTiles(previewProgress(step)).filter((tile) => tile.lit).length;
  expect(lit(0)).toBeGreaterThan(0);
  expect(lit(1)).toBeGreaterThan(lit(0));
  expect(lit(5)).toBe(pathTiles({}).length);
});
