/**
 * kitchen-table-map.ts — Chapter 1's map as data (STO-861 v3): the nodes, the rooms, the coach's
 * lines, and the path, all in the art's own 390 × 1760 frame. The rules that read it are
 * `chapter-map.ts`'s.
 *
 * The art (`assets/images/story/kitchen-table-map.svg`) is text-free; everything that changes
 * with progress is drawn over it. Its SVG filters (paper grain, wobbly ink) are beyond
 * react-native-svg, so the app ships a 2x JPEG rendered from it:
 *   chrome --headless --force-device-scale-factor=2 --window-size=390,1760 --screenshot …
 */

import { storyChapter } from "@wordpoker/game-rules";

import { scaledTo, type ChapterMap, type MapNode } from "./chapter-map";

const CHAPTER = storyChapter("kitchen-table");
const HEIGHT = 1760;
/** Node centres from the v3 spec's normalised path, scaled to the art. */
const at = scaledTo(HEIGHT);

export const KITCHEN_TABLE: ChapterMap = {
  chapter: CHAPTER,
  boss: "The Professor",
  badge: "Professor Badge",
  art: require("@/assets/images/story/kitchen-table-map.jpg"),
  tint: ["#131a2c", "#131a2c"],
  height: HEIGHT,
  // The rooms of the house a hand's table can be laid in: each is a crop of the map's own art.
  rooms: {
    porch: { x: 120, y: 1420 },
    "living-room": { x: 115, y: 1120 },
    kitchen: { x: 45, y: 830 },
    study: { x: 120, y: 300 },
  },
  nodes: [
    { id: "first-hand", kind: "hand", title: "First Hand", glyph: "1", ...at(0.5, 0.885), friend: { id: "ellis", dx: 80 }, challengeId: "first-hand", room: "porch", opponent: "Ellis", opener: "Pull up a chair. Spell a word with your two tiles and the board. Best word takes the pot." },
    { id: "chips-on-the-table", kind: "hand", title: "Chips on the Table", glyph: "2", ...at(0.28, 0.72), friend: { id: "jay", dx: 80 }, room: "living-room", opponent: "Jay", opener: "Chips on the table. Let’s see what you bet." },
    { id: "word-wizard", kind: "hand", title: "Word Wizard", glyph: "3", ...at(0.7, 0.565), friend: { id: "mira", dx: -80 }, challengeId: "word-wizard", room: "kitchen", opponent: "Mira", opener: "Long words win big. Use all seven tiles for the Full Rack Bonus." },
    { id: "bonus", kind: "bonus", title: "Bonus Puzzle", glyph: "?", ...at(0.2, 0.42), room: "kitchen", opponent: "Mira", opener: "A little extra, just for you." },
    { id: "professor", kind: "boss", title: "The Professor", glyph: "P", ...at(0.56, 0.26), room: "study", opponent: "The Professor", opener: "So you think you can spell?" },
  ] satisfies MapNode[],
  // The porch, and the Chapter 2 doorway.
  pathStart: at(0.5, 0.985),
  pathEnd: at(0.5, 0.145),
  door: { x: 140, y: 104 },
  coach: {
    hands: [
      { friend: "ellis", line: "Pull up a chair. Make a word from your tiles and the table." },
      { friend: "jay", line: "Chips on the table. Let’s see what you bet." },
      { friend: "mira", line: "Long words win big. Try your first power." },
    ],
    boss: { friend: "mira", line: "Uncle Prof crashed game night. Watch the bar over his seat." },
    bonus: { friend: "mira", line: `He sweats when he’s pushed. Beat ${CHAPTER.threshold} points to win.` },
    beaten: { friend: "mira", line: "You beat Uncle Prof! The Local’s open. First round’s on Jay." },
  },
};
