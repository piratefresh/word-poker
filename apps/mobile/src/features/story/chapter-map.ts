/**
 * chapter-map.ts — what every chapter's map shares (STO-861, STO-1120): the shape of a map
 * definition, the cast, and the rules that read a map — which nodes are open, what the coach says,
 * and the letter-tile path. Each chapter's own map is data: Chapter 1's is `kitchen-table-map.ts`,
 * and `chapter-maps.ts` holds the campaign's list.
 *
 * Maps are laid out in a 390-wide frame (each its own height); everything that changes with
 * progress is drawn over the art from here. Progress is the stars each played node earned: the
 * chapter run's save (`story-progress.ts`), whose rules (`nodeState`, thresholds) are game-rules'
 * `chapter-run.ts`, or `previewProgress` in development.
 */

import {
  EMPTY_STORY_PROGRESS,
  STORY_CHAPTERS,
  chapterRecord,
  nodeState as runNodeState,
  storyNode,
  type StoryChapter,
  type StoryProgress,
} from "@wordpoker/game-rules";

export const MAP_WIDTH = 390;

export type FriendId = "ellis" | "jay" | "mira";

/** How a friend's portrait looks: neutral by default, and what the table makes of the moment. */
export type Expression = "neutral" | "thinking" | "happy" | "wink" | "determined" | "surprised";

/** Ellis's faces (the user's own art kit); a friend with none shows their initial. */
const ELLIS_FACES: Record<Expression, number> = {
  neutral: require("@/assets/images/story/ellis/face-neutral.svg"),
  thinking: require("@/assets/images/story/ellis/face-thinking.svg"),
  happy: require("@/assets/images/story/ellis/face-happy.svg"),
  wink: require("@/assets/images/story/ellis/face-wink.svg"),
  determined: require("@/assets/images/story/ellis/face-determined.svg"),
  surprised: require("@/assets/images/story/ellis/face-surprised.svg"),
};

export const FRIENDS: Record<FriendId, { name: string; color: string; faces?: Record<Expression, number> }> = {
  ellis: { name: "Ellis", color: "#d9603f", faces: ELLIS_FACES },
  jay: { name: "Jay", color: "#2f7fc8" },
  mira: { name: "Mira", color: "#8a4cc4" },
};

/** How far the table zooms into the map's art. */
export const ROOM_ZOOM = 2.6;

export type MapNodeKind = "hand" | "bonus" | "boss";
export type MapNodeState = "locked" | "available" | "completed";

export interface MapNode {
  /** The chapter's node id in game-rules' `chapters.ts`; a boss node's id names its boss. */
  id: string;
  kind: MapNodeKind;
  title: string;
  /** What the disc shows until it is cleared. */
  glyph: string;
  /** Centre, in map points. */
  x: number;
  y: number;
  /** The friend sitting beside a hand node, and which side of it (points from centre). */
  friend?: { id: FriendId; dx: number };
  /** The room of the map's art this node's hand is played in; a map without art has none. */
  room?: string;
  /** Who sits across at this node, as the brief sheet names them. */
  opponent: string;
  /** The opponent's one line on the brief sheet, before the deal. */
  opener: string;
  /** The playable challenge in `challenges.ts`, where one is authored. */
  challengeId?: string;
}

/** One coach line, and who says it. */
export interface CoachSay {
  friend: FriendId;
  line: string;
}

type Point = { x: number; y: number };

/** One chapter's map as data. Art, positions and lines are the map's; the rules are the chapter's. */
export interface ChapterMap {
  chapter: StoryChapter;
  /** The boss as the map names it: `The Professor`. */
  boss: string;
  badge: string;
  /** The painted art in the map's frame, or `null` for a placeholder drawn as `tint`. */
  art: number | null;
  /** The colours the map fades through, top to bottom: behind the art, or all there is without it. */
  tint: readonly [string, string];
  height: number;
  /** Where each room's crop of the art starts, in map points. */
  rooms: Readonly<Record<string, Point>>;
  /** Hands in order, then the bonus, then the boss, as the chapter lists them. */
  nodes: readonly MapNode[];
  /** Where the path enters, and where it leaves (the next chapter's doorway). */
  pathStart: Point;
  pathEnd: Point;
  /** The next chapter's doorway (the frame's top-left), on every chapter but the last. */
  door?: Point;
  coach: {
    /** What the coach says at each hand while it is the next one, in hand order. */
    hands: readonly CoachSay[];
    /** At the boss, once every hand is played. */
    boss: CoachSay;
    /** At the boss, once the bonus is played too. */
    bonus?: CoachSay;
    /** At the boss, once it is beaten. */
    beaten: CoachSay;
  };
}

/** Node centres from a normalised path, scaled to a map `height` tall. */
export const scaledTo = (height: number) => (x: number, y: number): Point => ({ x: x * MAP_WIDTH, y: y * height });

export type ChapterProgress = Partial<Record<string, number>>;

const handsOf = (map: ChapterMap) => map.nodes.filter((node) => node.kind === "hand");

export function bossNode(map: ChapterMap): MapNode {
  return map.nodes.find((node) => node.kind === "boss")!;
}

/** Every node's 3 stars. */
export function maxStars(map: ChapterMap): number {
  return map.nodes.length * 3;
}

/**
 * The chapter run's rule: hands one after another, then the bonus and the boss together. A map is
 * only drawn for a chapter that is open (the route checks `chapterUnlocked`), so the save it reads
 * holds the chapter before as beaten.
 */
export function nodeState(map: ChapterMap, node: MapNode, progress: ChapterProgress): MapNodeState {
  const { chapter } = map;
  const before = STORY_CHAPTERS[STORY_CHAPTERS.indexOf(chapter) - 1];
  const stars = progress as Record<string, number>;
  const save: StoryProgress = {
    chapters: {
      ...(before === undefined ? {} : { [before.id]: { ...chapterRecord(EMPTY_STORY_PROGRESS, before.id), bossCleared: true } }),
      [chapter.id]: { ...chapterRecord(EMPTY_STORY_PROGRESS, chapter.id), stars },
    },
  };
  return runNodeState(save, chapter, storyNode(chapter, node.id));
}

function handsCleared(map: ChapterMap, progress: ChapterProgress): number {
  return handsOf(map).filter((hand) => progress[hand.id] !== undefined).length;
}

export function chapterStars(progress: ChapterProgress): number {
  return Object.values(progress).reduce<number>((sum, stars) => sum + (stars ?? 0), 0);
}

export function bossBeaten(map: ChapterMap, progress: ChapterProgress): boolean {
  return progress[bossNode(map).id] !== undefined;
}

export interface CoachLine extends CoachSay {
  /** The node the bubble points at. */
  node: MapNode;
}

/** The coach points at the next hand, then at the boss (not the optional bonus). */
export function coachFor(map: ChapterMap, progress: ChapterProgress): CoachLine {
  const hands = handsOf(map);
  const boss = bossNode(map);
  const next = hands.findIndex((hand) => nodeState(map, hand, progress) === "available");
  if (next >= 0) return { ...map.coach.hands[next]!, node: hands[next]! };
  if (bossBeaten(map, progress)) return { ...map.coach.beaten, node: boss };
  if (progress.bonus !== undefined && map.coach.bonus !== undefined) return { ...map.coach.bonus, node: boss };
  return { ...map.coach.boss, node: boss };
}

export interface PathTile {
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  letter: string;
  /** Walked: on a stretch of path the player has already cleared. */
  lit: boolean;
}

const TILE_STEP = 38;
const TILE_LETTERS = "WORDPOKER";

/** Points every `step` along a Catmull-Rom curve through `points`, tagged with their segment. */
function samplePath(points: readonly Point[], step: number): (Point & { segment: number })[] {
  const out: (Point & { segment: number })[] = [];
  let travelled = step * 0.5;
  let previous = points[0]!;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const p0 = points[Math.max(segment - 1, 0)]!;
    const p1 = points[segment]!;
    const p2 = points[segment + 1]!;
    const p3 = points[Math.min(segment + 2, points.length - 1)]!;
    const curve = (a: number, b: number, c: number, d: number, t: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    for (let t = 0; t <= 1; t += 0.004) {
      const point = { x: curve(p0.x, p1.x, p2.x, p3.x, t), y: curve(p0.y, p1.y, p2.y, p3.y, t) };
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
      if (travelled >= step) {
        travelled = 0;
        out.push({ ...point, segment });
      }
    }
  }
  return out;
}

/** Disc diameter in map points: 66, and 92 for the boss. */
export function discSize(node: MapNode): number {
  return node.kind === "boss" ? 92 : 66;
}

/** A tile would sit under a node's disc or its labels. */
function underNode(map: ChapterMap, point: Point): boolean {
  return map.nodes.some((node) => {
    const radius = discSize(node) / 2;
    const above = node.kind === "boss" ? 56 : 10;
    return Math.abs(point.x - node.x) < 64 && point.y > node.y - radius - above && point.y < node.y + radius + 64;
  });
}

/**
 * The letter-tile path from the entrance, through the hands and the boss, to the doorway. The
 * bonus sits off the path. Stretches up to the furthest cleared stop are lit.
 */
export function pathTiles(map: ChapterMap, progress: ChapterProgress): PathTile[] {
  const stops = map.nodes.filter((node) => node.kind !== "bonus");
  const walked = handsCleared(map, progress) + (bossBeaten(map, progress) ? 1 : 0);
  return samplePath([map.pathStart, ...stops, map.pathEnd], TILE_STEP)
    .filter((point) => !underNode(map, point))
    .map((point, index) => ({
      x: point.x,
      y: point.y,
      rotation: ((index * 37) % 17) - 8,
      letter: TILE_LETTERS[index % TILE_LETTERS.length]!,
      lit: point.segment <= walked,
    }));
}

/** The v3 mock's sample stars, one per node in the chapter's order. */
const PREVIEW_STARS = [3, 2, 3, 1, 3];

/**
 * Development only: the v3 mock's progress slider, 0 to the node count (each step clears the
 * next node: the hands, then the bonus, then the boss), with its sample stars.
 */
export function previewProgress(map: ChapterMap, step: number): ChapterProgress {
  const cleared = map.nodes.slice(0, Math.max(0, Math.min(map.nodes.length, step)));
  return Object.fromEntries(cleared.map((node, index) => [node.id, PREVIEW_STARS[index] ?? 3]));
}
