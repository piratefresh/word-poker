/**
 * chapters.ts — story mode's campaign as config (STO-973, `docs/rules/story-mode.md`): the five
 * chapters, the nodes each one climbs through, the power pool its draft offers, and what its boss
 * pays on the first clear. Every number here is a starting point to tune after playtesting.
 */

import type { PowerUpId } from "@wordpoker/contracts";

/** The run's fixed rules, kept beside the chapters so playtests tune them in one place. */
export const STORY_RULES = {
  /** How many drafted powers a run holds; a pick past this replaces one. */
  heldPowerCap: 3,
  /** How many powers the draft after a hand offers (fewer when the pool runs short). */
  draftOfferCount: 3,
  /** 3★ is the threshold beaten by this share or more. */
  threeStarMargin: 0.25,
  /** Boss losses in a row before the coach offers a hint about the tell. */
  coachHintAfterBossLosses: 2,
} as const;

export type StoryNodeKind = "hand" | "bonus" | "boss";

export interface StoryNode {
  readonly id: string;
  readonly kind: StoryNodeKind;
  /** The word score 2★ asks for at this node. Absent means the chapter's threshold. */
  readonly threshold?: number;
}

export interface StoryChapter {
  readonly id: string;
  readonly number: number;
  readonly venue: string;
  readonly boss: string;
  /** The boss hand's word score to beat, and every node's default 2★ score. */
  readonly threshold: number;
  /** Hands in order, then the bonus, then the boss; the final chapter is its boss alone. */
  readonly nodes: readonly StoryNode[];
  /** What the draft after each hand offers from. */
  readonly powerPool: readonly PowerUpId[];
  /** Powers picked straight from the pool before the boss, for a chapter with no hands to draft from. */
  readonly loadout?: number;
  /** Paid once, on the boss's first clear. */
  readonly reward: { readonly coins: number; readonly xp: number };
}

const HANDS_THEN_BOSS = (boss: string): readonly StoryNode[] => [
  { id: "hand-1", kind: "hand" },
  { id: "hand-2", kind: "hand" },
  { id: "hand-3", kind: "hand" },
  { id: "bonus", kind: "bonus" },
  { id: boss, kind: "boss" },
];

// Pickpocket, Tile Lock, Multiplier and High Value Tile join these pools with STO-975.
const LATE_POOL: readonly PowerUpId[] = ["blank_tile", "random_wild"];

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: "kitchen-table",
    number: 1,
    venue: "Kitchen Table",
    boss: "The Professor",
    threshold: 15,
    // The friend hands are STO-860's lessons; their 2★ scores sit where each lesson's word does.
    nodes: [
      { id: "first-hand", kind: "hand", threshold: 11 },
      { id: "chips-on-the-table", kind: "hand", threshold: 12 },
      { id: "word-wizard", kind: "hand", threshold: 20 },
      { id: "bonus", kind: "bonus" },
      { id: "professor", kind: "boss" },
    ],
    powerPool: ["blank_tile", "random_wild"],
    reward: { coins: 100, xp: 50 },
  },
  {
    id: "the-local",
    number: 2,
    venue: "The Local",
    boss: "Vowel Vinny",
    threshold: 24,
    nodes: HANDS_THEN_BOSS("vowel-vinny"),
    powerPool: ["blank_tile", "random_wild", "vowel_magnet"],
    reward: { coins: 200, xp: 100 },
  },
  {
    id: "the-back-room",
    number: 3,
    venue: "The Back Room",
    boss: "The Hustler",
    threshold: 30,
    nodes: HANDS_THEN_BOSS("hustler"),
    powerPool: ["blank_tile", "random_wild", "vowel_magnet"],
    reward: { coins: 300, xp: 150 },
  },
  {
    id: "high-roller-lounge",
    number: 4,
    venue: "The High Roller Lounge",
    boss: "Lady Q",
    threshold: 38,
    nodes: HANDS_THEN_BOSS("lady-q"),
    powerPool: LATE_POOL,
    reward: { coins: 400, xp: 200 },
  },
  {
    id: "dealers-table",
    number: 5,
    venue: "The Dealer's Table",
    boss: "The Dealer",
    threshold: 45,
    nodes: [{ id: "dealer", kind: "boss" }],
    powerPool: LATE_POOL,
    loadout: 2,
    // Includes the Story Mode Champion bonus.
    reward: { coins: 1500, xp: 750 },
  },
];

/** @throws {RangeError} For an id no chapter has. */
export function storyChapter(id: string): StoryChapter {
  const chapter = STORY_CHAPTERS.find((candidate) => candidate.id === id);
  if (chapter === undefined) throw new RangeError(`No story chapter "${id}".`);
  return chapter;
}

/** @throws {RangeError} For an id the chapter has no node for. */
export function storyNode(chapter: StoryChapter, id: string): StoryNode {
  const node = chapter.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new RangeError(`Chapter "${chapter.id}" has no node "${id}".`);
  return node;
}

export function nodeThreshold(chapter: StoryChapter, node: StoryNode): number {
  return node.threshold ?? chapter.threshold;
}
