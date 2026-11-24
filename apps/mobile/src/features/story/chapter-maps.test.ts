import { EMPTY_STORY_PROGRESS, STORY_CHAPTERS, isBossId, recordHand, type StoryProgress } from "@wordpoker/game-rules";

import { BOSS_COPY } from "./bosses";
import { bossNode, coachFor, discSize, nodeState, pathTiles, previewProgress } from "./chapter-map";
import { CHAPTER_MAPS, chapterMap, nextChapterMap, openChapter, openNode } from "./chapter-maps";
import { KITCHEN_TABLE } from "./kitchen-table-map";

/** A save with each chapter's boss in `cleared` beaten, as the run records it. */
function clearing(...cleared: string[]): StoryProgress {
  let save = EMPTY_STORY_PROGRESS;
  for (const id of cleared) {
    const map = chapterMap(id)!;
    for (const node of map.nodes) {
      if (node.kind === "bonus") continue;
      save = recordHand(save, id, node.id, { won: true, score: 99 }, 1).progress;
    }
  }
  return save;
}

describe("the campaign's maps", () => {
  test("there is one per chapter, in order, with the chapter's own nodes", () => {
    expect(CHAPTER_MAPS.map((map) => map.chapter)).toEqual(STORY_CHAPTERS);
    for (const map of CHAPTER_MAPS) {
      expect(map.nodes.map((node) => [node.id, node.kind])).toEqual(map.chapter.nodes.map((node) => [node.id, node.kind]));
    }
  });

  test("each boss node seats that chapter's boss", () => {
    expect(CHAPTER_MAPS.map((map) => bossNode(map).id)).toEqual(["professor", "vowel-vinny", "hustler", "lady-q", "dealer"]);
    for (const map of CHAPTER_MAPS) expect(isBossId(bossNode(map).id)).toBe(true);
  });

  test("chapters 2–4 open on Ellis, Jay and Mira's hands, and The Dealer's is the boss alone", () => {
    for (const map of CHAPTER_MAPS.slice(1, 4)) {
      expect(map.nodes.flatMap((node) => (node.friend === undefined ? [] : [node.friend.id]))).toEqual(["ellis", "jay", "mira"]);
      expect(map.coach.hands).toHaveLength(3);
    }
    expect(CHAPTER_MAPS[4]!.nodes).toHaveLength(1);
    expect(nodeState(CHAPTER_MAPS[4]!, CHAPTER_MAPS[4]!.nodes[0]!, {})).toBe("available");
  });

  test("the coach names each chapter's own boss, not The Professor", () => {
    for (const map of CHAPTER_MAPS.slice(1)) {
      const ready = previewProgress(map, map.nodes.length - 1);
      const beaten = previewProgress(map, map.nodes.length);
      expect(coachFor(map, ready).node).toBe(bossNode(map));
      expect(coachFor(map, beaten).line).toContain(map.boss);
      expect(JSON.stringify(map.coach)).not.toMatch(/Professor|Uncle Prof/);
    }
    expect(coachFor(CHAPTER_MAPS[1]!, previewProgress(CHAPTER_MAPS[1]!, 3)).line).toBe(BOSS_COPY["vowel-vinny"].coach);
  });

  test("placeholders have no art yet, so every node plays on the map's tint", () => {
    for (const map of CHAPTER_MAPS.slice(1)) {
      expect(map.art).toBeNull();
      expect(map.nodes.every((node) => node.room === undefined)).toBe(true);
    }
  });

  test("every chapter but the last has a door; no path tile sits under a disc", () => {
    expect(CHAPTER_MAPS.map((map) => map.door !== undefined)).toEqual([true, true, true, true, false]);
    for (const map of CHAPTER_MAPS) {
      const tiles = pathTiles(map, {});
      expect(tiles.length).toBeGreaterThan(0);
      for (const node of map.nodes) {
        expect(tiles.some((tile) => Math.hypot(tile.x - node.x, tile.y - node.y) < discSize(node) / 2)).toBe(false);
      }
    }
  });
});

describe("chapter routing", () => {
  test("no chapter id means Chapter 1; an unknown one means none", () => {
    expect(chapterMap(undefined)).toBe(KITCHEN_TABLE);
    expect(chapterMap("the-local")?.chapter.number).toBe(2);
    expect(chapterMap("nowhere")).toBeNull();
  });

  test("each door leads to the next chapter, and the last leads nowhere", () => {
    expect(CHAPTER_MAPS.slice(0, 4).map((map) => nextChapterMap(map))).toEqual(CHAPTER_MAPS.slice(1));
    expect(nextChapterMap(CHAPTER_MAPS[4]!)).toBeNull();
  });

  test("a chapter opens only once the boss before it is beaten", () => {
    expect(openChapter(undefined, EMPTY_STORY_PROGRESS)).toBe(KITCHEN_TABLE);
    expect(openChapter("the-local", EMPTY_STORY_PROGRESS)).toBeNull();
    expect(openChapter("the-local", clearing("kitchen-table"))?.chapter.id).toBe("the-local");
    expect(openChapter("the-back-room", clearing("kitchen-table"))).toBeNull();
    expect(openChapter("dealers-table", clearing("kitchen-table", "the-local", "the-back-room", "high-roller-lounge"))?.chapter.id).toBe("dealers-table");
  });

  test("a hand link deals only an open node of an open chapter", () => {
    const save = clearing("kitchen-table");
    expect(openNode(undefined, "first-hand", EMPTY_STORY_PROGRESS)?.node.id).toBe("first-hand");
    expect(openNode(undefined, "professor", EMPTY_STORY_PROGRESS)).toBeNull();
    expect(openNode("the-local", "hand-1", EMPTY_STORY_PROGRESS)).toBeNull();
    expect(openNode("the-local", "hand-1", save)?.map.chapter.id).toBe("the-local");
    expect(openNode("the-local", "hand-2", save)).toBeNull();
    expect(openNode("the-local", "first-hand", save)).toBeNull();
  });
});
