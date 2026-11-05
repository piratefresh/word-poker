import type { Tile } from "@wordpoker/contracts";

import { bestUnusedTile, storyCoachLine } from "./story-coach";

const goals = { two: 11, three: 14 };
const K: Tile = { id: "K-1", letter: "K", points: 5 };
const A: Tile = { id: "A-1", letter: "A", points: 1 };
const base = { street: "Street line.", valid: true, goals, unused: { letter: "K", points: 5 } };

test("the best unused tile is the most valuable one the word leaves", () => {
  expect(bestUnusedTile([A, K], [{ tileId: "A-1" }])).toEqual({ letter: "K", points: 5 });
  expect(bestUnusedTile([A, K], [{ tileId: "K-1" }])).toEqual({ letter: "A", points: 1 });
  expect(bestUnusedTile([A], [{ tileId: "A-1" }])).toBeNull();
});

test("with no word the coach says the street's line", () => {
  expect(storyCoachLine({ ...base, word: "", score: null })).toBe("Street line.");
  expect(storyCoachLine({ ...base, word: "BOA", score: null })).toBe("Street line.");
});

test("a word under ★★ is told how far it is and which tile is worth more", () => {
  expect(storyCoachLine({ ...base, word: "BOATS", score: 10 })).toBe("BOATS is 10. 1 more for ★★. The K is worth 5.");
});

test("a ★★ word is told the way to ★★★", () => {
  expect(storyCoachLine({ ...base, word: "BATONS", score: 12 })).toBe("BATONS is 12, a ★★. 2 more for ★★★. The K is worth 5.");
});

test("a ★★★ word is told to lock it in", () => {
  expect(storyCoachLine({ ...base, word: "KNOBS", score: 14, unused: null })).toBe("KNOBS is 14. That's ★★★. Lock it in.");
});

test("a one-point leftover is not worth a tip", () => {
  expect(storyCoachLine({ ...base, word: "BOATS", score: 10, unused: { letter: "A", points: 1 } })).toBe("BOATS is 10. 1 more for ★★.");
});

test("a run of tiles that is not a word is not praised for its score", () => {
  expect(storyCoachLine({ ...base, word: "BOSKN", score: 14, valid: false })).toBe("BOSKN isn't a word. Slide the tiles around to spell one.");
});
