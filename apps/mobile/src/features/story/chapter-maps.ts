/**
 * chapter-maps.ts — the campaign's maps, one per chapter of game-rules' `STORY_CHAPTERS`
 * (STO-1120), and which of them a link may open.
 *
 * Chapter 1 has its painted art (`kitchen-table-map.ts`). Chapters 2–5 are placeholders until
 * their art lands (STO-978–981): a plain path on the venue's tint. Real art drops in as data: set
 * `art`, `rooms` and each node's `room`, and move the nodes onto it.
 */

import {
  STORY_CHAPTERS,
  chapterRecord,
  chapterUnlocked,
  storyChapter,
  type BossId,
  type StoryProgress,
} from "@wordpoker/game-rules";

import { BOSS_COPY, bossName } from "./bosses";
import { nodeState, scaledTo, type ChapterMap, type CoachSay, type MapNode } from "./chapter-map";
import { KITCHEN_TABLE } from "./kitchen-table-map";

interface Placeholder {
  chapterId: string;
  boss: BossId;
  badge: string;
  tint: ChapterMap["tint"];
  /** The boss's line on the brief sheet. */
  bossOpener: string;
  /** Each hand's title, opener, and what the coach says while it is next, in order. */
  hands: readonly [string, string, string][];
}

const PLACEHOLDER_HEIGHT = 1300;
/** The friend at each hand, and the side of the node they sit on: Chapter 1's seating. */
const SEATS = [{ id: "ellis", dx: 80 }, { id: "jay", dx: 80 }, { id: "mira", dx: -80 }] as const;
const SEAT_NAMES = ["Ellis", "Jay", "Mira"] as const;

/** A chapter's map until its art lands: Chapter 1's climb, on a plain tint. */
function placeholderMap({ chapterId, boss, badge, tint, bossOpener, hands }: Placeholder): ChapterMap {
  const chapter = storyChapter(chapterId);
  const name = bossName(boss);
  const next = STORY_CHAPTERS[STORY_CHAPTERS.indexOf(chapter) + 1];
  const final = chapter.loadout !== undefined;
  // The final chapter is its boss alone, halfway up a shorter map.
  const height = final ? 1000 : PLACEHOLDER_HEIGHT;
  const at = scaledTo(height);
  const spots = [at(0.5, 0.86), at(0.28, 0.72), at(0.7, 0.58)];
  const handNodes: MapNode[] = hands.map(([title, opener], index) => ({
    id: `hand-${index + 1}`,
    kind: "hand",
    title,
    glyph: String(index + 1),
    ...spots[index]!,
    friend: SEATS[index]!,
    opponent: SEAT_NAMES[index]!,
    opener,
  }));
  const bonus: MapNode = { id: "bonus", kind: "bonus", title: "Bonus Puzzle", glyph: "?", ...at(0.2, 0.47), opponent: "Mira", opener: "A little extra, just for you." };
  const bossAt: MapNode = { id: boss, kind: "boss", title: name, glyph: name.replace(/^The /, "")[0]!, ...(final ? at(0.5, 0.5) : at(0.56, 0.35)), opponent: name, opener: bossOpener };
  // The bubble sits over the boss's threshold plate: three lines at most.
  const tell: CoachSay = boss === "dealer"
    ? { friend: "ellis", line: "Pick two powers. The Dealer plays like a new boss every hand." }
    : { friend: "mira", line: BOSS_COPY[boss].coach };
  return {
    chapter,
    boss: name,
    badge,
    art: null,
    tint,
    height,
    rooms: {},
    nodes: final ? [bossAt] : [...handNodes, bonus, bossAt],
    pathStart: at(0.5, 0.985),
    pathEnd: at(0.5, final ? 0.2 : 0.195),
    ...(next === undefined ? {} : { door: { x: 140, y: 104 } }),
    coach: {
      hands: hands.map(([, , line], index) => ({ friend: SEATS[index]!.id, line })),
      boss: tell,
      bonus: { friend: "mira", line: `${name} is waiting. Beat ${chapter.threshold} points to win.` },
      beaten: {
        friend: "mira",
        line: next === undefined ? `You beat ${name}! You’re the Story Mode champion.` : `You beat ${name}! ${next.venue}’s open.`,
      },
    },
  };
}

export const CHAPTER_MAPS: readonly ChapterMap[] = [
  KITCHEN_TABLE,
  placeholderMap({
    chapterId: "the-local",
    boss: "vowel-vinny",
    badge: "Vinny Badge",
    tint: ["#4a2c16", "#1c100a"],
    bossOpener: "Vowels are the good stuff. I’m keeping mine.",
    hands: [
      ["First Round", "First round’s on Jay. Deal me in.", "First round’s on Jay. Deal us in at The Local."],
      ["Pub Quiz", "Quiz night. Every letter counts.", "Pub rules: bet like you mean it."],
      ["Last Orders", "Last orders. Make it a long one.", "Vinny’s watching. Show him a long word."],
    ],
  }),
  placeholderMap({
    chapterId: "the-back-room",
    boss: "hustler",
    badge: "Hustler Badge",
    tint: ["#1f3a2e", "#0a1510"],
    bossOpener: "Raise. I always raise.",
    hands: [
      ["Cut the Deck", "Nobody gets back here by accident.", "The Back Room. Keep your tiles close."],
      ["Smoke and Mirrors", "Bluff me if you can.", "Big bets don’t mean big words."],
      ["High Stakes", "Bigger pots, bigger words.", "Use your powers. The Hustler won’t wait."],
    ],
  }),
  placeholderMap({
    chapterId: "high-roller-lounge",
    boss: "lady-q",
    badge: "Lady Q Badge",
    tint: ["#36204e", "#120a1e"],
    bossOpener: "Rare letters for a rare evening.",
    hands: [
      ["Velvet Rope", "You made the list. Don’t waste it.", "Welcome to the Lounge. The tiles are worth more here."],
      ["Champagne Round", "Every letter sparkles in here.", "Rare letters, rare points. Hunt for them."],
      ["All That Glitters", "Spend those tiles like you mean it.", "One more, then Lady Q."],
    ],
  }),
  placeholderMap({
    chapterId: "dealers-table",
    boss: "dealer",
    badge: "Dealer Badge",
    tint: ["#4a1220", "#0e0408"],
    bossOpener: "Every boss you beat, I taught. Shuffle up.",
    hands: [],
  }),
];

/** The map a `/story?chapter=` link names: Chapter 1 without one, `null` for an id no chapter has. */
export function chapterMap(id: string | undefined): ChapterMap | null {
  if (id === undefined) return KITCHEN_TABLE;
  return CHAPTER_MAPS.find((map) => map.chapter.id === id) ?? null;
}

/** The chapter after `map`'s, or `null` after the last. */
export function nextChapterMap(map: ChapterMap): ChapterMap | null {
  return CHAPTER_MAPS[CHAPTER_MAPS.indexOf(map) + 1] ?? null;
}

/** The map a link may open: `null` for an unknown chapter, or one whose boss before is unbeaten. */
export function openChapter(id: string | undefined, save: StoryProgress): ChapterMap | null {
  const map = chapterMap(id);
  return map !== null && chapterUnlocked(save, map.chapter) ? map : null;
}

/** The node a `/story-hand` link may deal: `null` for an unknown node, or one still locked. */
export function openNode(chapterId: string | undefined, nodeId: string | undefined, save: StoryProgress): { map: ChapterMap; node: MapNode } | null {
  const map = openChapter(chapterId, save);
  const node = map?.nodes.find((candidate) => candidate.id === nodeId);
  if (map === null || node === undefined) return null;
  return nodeState(map, node, chapterRecord(save, map.chapter.id).stars) === "locked" ? null : { map, node };
}
