/**
 * story-badges.ts — the badges a saved run has won (STO-1129): one per boss beaten, and Story Mode
 * Champion for beating The Dealer. A badge is read from the save's `bossCleared`, never stored.
 */

import { chapterRecord, type StoryProgress } from "@wordpoker/game-rules";

import { bossNode, type ChapterMap } from "./chapter-map";
import { CHAPTER_MAPS } from "./chapter-maps";

export interface StoryBadge {
  /** The boss's chapter id, or `champion`. */
  id: string;
  name: string;
  /** What the medal is stamped with: the boss's letter. */
  letter: string;
  won: boolean;
}

const CHAMPION = { id: "champion", name: "Story Mode Champion", letter: "★" };

/** A chapter's own badges: its boss's, and Story Mode Champion with the last chapter's. */
export function chapterBadges(map: ChapterMap, won: boolean): StoryBadge[] {
  const boss = { id: map.chapter.id, name: map.badge, letter: bossNode(map).glyph, won };
  return map === CHAPTER_MAPS.at(-1) ? [boss, { ...CHAMPION, won }] : [boss];
}

/** Every badge in shelf order: the five bosses by chapter, then Story Mode Champion. */
export function storyBadges(save: StoryProgress): StoryBadge[] {
  const badges = CHAPTER_MAPS.flatMap((map) => chapterBadges(map, chapterRecord(save, map.chapter.id).bossCleared));
  return [...badges.filter((badge) => badge.id !== CHAMPION.id), ...badges.filter((badge) => badge.id === CHAMPION.id)];
}
