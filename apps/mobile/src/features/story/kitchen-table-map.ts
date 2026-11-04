/**
 * kitchen-table-map.ts — Chapter 1's map as data (STO-861 v3): the nodes, the rule that opens
 * them, the coach's line, and the letter-tile path, all in the art's own 390 × 1760 frame.
 *
 * The art (`assets/images/story/kitchen-table-map.svg`) is text-free; everything that changes
 * with progress is drawn over it from here. Its SVG filters (paper grain, wobbly ink) are beyond
 * react-native-svg, so the app ships a 2x JPEG rendered from it:
 *   chrome --headless --force-device-scale-factor=2 --window-size=390,1760 --screenshot …
 *
 * Progress is the stars each cleared node earned. Saving it is STO-973's; until then the screen
 * starts empty, or from `previewProgress` in development.
 */

export const MAP_WIDTH = 390;
export const MAP_HEIGHT = 1760;

export type FriendId = "ellis" | "jay" | "mira";

export const FRIENDS: Record<FriendId, { name: string; color: string }> = {
  ellis: { name: "Ellis", color: "#d9603f" },
  jay: { name: "Jay", color: "#2f7fc8" },
  mira: { name: "Mira", color: "#8a4cc4" },
};

export type MapNodeId = "first-hand" | "chips-on-the-table" | "word-wizard" | "bonus" | "professor";
export type MapNodeKind = "hand" | "bonus" | "boss";
export type MapNodeState = "locked" | "available" | "completed";

export interface MapNode {
  id: MapNodeId;
  kind: MapNodeKind;
  title: string;
  /** What the disc shows until it is cleared. */
  glyph: string;
  /** Centre, in map points. */
  x: number;
  y: number;
  /** The friend sitting beside a hand node, and which side of it (points from centre). */
  friend?: { id: FriendId; dx: number };
  /** The playable challenge in `challenges.ts`, where one is authored. */
  challengeId?: string;
}

/** Node centres from the v3 spec's normalised path, scaled to the art. */
const at = (x: number, y: number) => ({ x: x * MAP_WIDTH, y: y * MAP_HEIGHT });

export const KITCHEN_TABLE = {
  number: 1,
  title: "Kitchen Table",
  boss: "The Professor",
  /** The boss hand's word score to beat. STO-973 moves this into the chapter config. */
  threshold: 15,
  maxStars: 15,
  nextChapter: "The Local",
  badge: "Professor Badge",
  nodes: [
    { id: "first-hand", kind: "hand", title: "First Hand", glyph: "1", ...at(0.5, 0.885), friend: { id: "ellis", dx: 80 }, challengeId: "first-hand" },
    { id: "chips-on-the-table", kind: "hand", title: "Chips on the Table", glyph: "2", ...at(0.28, 0.72), friend: { id: "jay", dx: 80 } },
    { id: "word-wizard", kind: "hand", title: "Word Wizard", glyph: "3", ...at(0.7, 0.565), friend: { id: "mira", dx: -80 }, challengeId: "word-wizard" },
    { id: "bonus", kind: "bonus", title: "Bonus Puzzle", glyph: "?", ...at(0.2, 0.42) },
    { id: "professor", kind: "boss", title: "The Professor", glyph: "P", ...at(0.56, 0.26) },
  ] satisfies MapNode[] as readonly MapNode[],
} as const;

/** Where the path enters (the porch) and leaves (the Chapter 2 doorway). */
const PATH_START = at(0.5, 0.985);
const PATH_END = at(0.5, 0.145);

export type ChapterProgress = Partial<Record<MapNodeId, number>>;

const HANDS = KITCHEN_TABLE.nodes.filter((node) => node.kind === "hand");

/** Hands open one after another; the bonus and the boss both open once the third hand is cleared. */
export function nodeState(node: MapNode, progress: ChapterProgress): MapNodeState {
  if (progress[node.id] !== undefined) return "completed";
  if (node.kind !== "hand") return handsCleared(progress) === HANDS.length ? "available" : "locked";
  const index = HANDS.indexOf(node);
  return index === 0 || progress[HANDS[index - 1]!.id] !== undefined ? "available" : "locked";
}

function handsCleared(progress: ChapterProgress): number {
  return HANDS.filter((hand) => progress[hand.id] !== undefined).length;
}

export function chapterStars(progress: ChapterProgress): number {
  return Object.values(progress).reduce<number>((sum, stars) => sum + (stars ?? 0), 0);
}

export function bossBeaten(progress: ChapterProgress): boolean {
  return progress.professor !== undefined;
}

export interface CoachLine {
  friend: FriendId;
  line: string;
  /** The node the bubble points at. */
  node: MapNode;
}

/** The coach points at the next hand, then at the boss (not the optional bonus). */
export function coachFor(progress: ChapterProgress): CoachLine {
  const [first, second, third] = HANDS;
  const boss = KITCHEN_TABLE.nodes.find((node) => node.kind === "boss")!;
  const next = HANDS.find((hand) => nodeState(hand, progress) === "available");
  if (next === first) return { friend: "ellis", line: "Pull up a chair. Make a word from your tiles and the table.", node: next! };
  if (next === second) return { friend: "jay", line: "Chips on the table. Let’s see what you bet.", node: next! };
  if (next === third) return { friend: "mira", line: "Long words win big. Try your first power.", node: next! };
  if (bossBeaten(progress)) return { friend: "mira", line: "You beat Uncle Prof! The Local’s open. First round’s on Jay.", node: boss };
  if (progress.bonus !== undefined) {
    return { friend: "mira", line: `He sweats when he’s pushed. Beat ${KITCHEN_TABLE.threshold} points to win.`, node: boss };
  }
  return { friend: "mira", line: "Uncle Prof crashed game night. Watch the bar over his seat.", node: boss };
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

type Point = { x: number; y: number };

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
function underNode(point: Point): boolean {
  return KITCHEN_TABLE.nodes.some((node) => {
    const radius = discSize(node) / 2;
    const above = node.kind === "boss" ? 56 : 10;
    return Math.abs(point.x - node.x) < 64 && point.y > node.y - radius - above && point.y < node.y + radius + 64;
  });
}

/**
 * The letter-tile path from the porch, through the hands and the boss, to the doorway. The bonus
 * sits off the path. Stretches up to the furthest cleared stop are lit.
 */
export function pathTiles(progress: ChapterProgress): PathTile[] {
  const stops = KITCHEN_TABLE.nodes.filter((node) => node.kind !== "bonus");
  const walked = handsCleared(progress) + (bossBeaten(progress) ? 1 : 0);
  return samplePath([PATH_START, ...stops, PATH_END], TILE_STEP)
    .filter((point) => !underNode(point))
    .map((point, index) => ({
      x: point.x,
      y: point.y,
      rotation: ((index * 37) % 17) - 8,
      letter: TILE_LETTERS[index % TILE_LETTERS.length]!,
      lit: point.segment <= walked,
    }));
}

/**
 * Development only: the v3 mock's progress slider, 0–5 (0–3 hands cleared, 4 the bonus too, 5
 * the boss beaten), with its sample stars.
 */
export function previewProgress(step: number): ChapterProgress {
  const order: [MapNodeId, number][] = [
    ["first-hand", 3],
    ["chips-on-the-table", 2],
    ["word-wizard", 3],
    ["bonus", 1],
    ["professor", 3],
  ];
  return Object.fromEntries(order.slice(0, Math.max(0, Math.min(5, step))));
}
