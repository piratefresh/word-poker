import { EMPTY_STORY_PROGRESS, STORY_CHAPTERS, type StoryProgress } from "@wordpoker/game-rules";

import { CHAPTER_MAPS } from "./chapter-maps";
import { chapterBadges, storyBadges } from "./story-badges";

const cleared = (...ids: string[]): StoryProgress => ({
  chapters: Object.fromEntries(ids.map((id) => [id, { stars: {}, best: {}, bossCleared: true, powers: [], draft: null, bossLosses: 0 }])),
});

test("the shelf holds a badge per boss in chapter order, then Story Mode Champion", () => {
  const badges = storyBadges(EMPTY_STORY_PROGRESS);

  expect(badges.map((badge) => badge.id)).toEqual([...STORY_CHAPTERS.map((chapter) => chapter.id), "champion"]);
  expect(badges.map((badge) => badge.letter)).toEqual(["P", "V", "H", "L", "D", "★"]);
  expect(badges.every((badge) => !badge.won)).toBe(true);
});

test("a badge is won once its boss is beaten", () => {
  const won = storyBadges(cleared("kitchen-table", "the-local")).filter((badge) => badge.won);

  expect(won.map((badge) => badge.name)).toEqual(["Professor Badge", "Vinny Badge"]);
});

test("beating The Dealer wins his badge and Story Mode Champion", () => {
  const all = storyBadges(cleared(...STORY_CHAPTERS.map((chapter) => chapter.id)));

  expect(all.every((badge) => badge.won)).toBe(true);
  expect(chapterBadges(CHAPTER_MAPS.at(-1)!, true).map((badge) => badge.name)).toEqual(["Dealer Badge", "Story Mode Champion"]);
  expect(chapterBadges(CHAPTER_MAPS[0]!, true).map((badge) => badge.name)).toEqual(["Professor Badge"]);
});
