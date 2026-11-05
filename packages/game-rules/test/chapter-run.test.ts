import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_STORY_PROGRESS,
  chapterRecord,
  chapterStars,
  draftOffers,
  nodeStars,
  nodeState,
  pickDraft,
  recordHand,
  setLoadout,
  skipDraft,
  type HandOutcome,
  type StoryProgress,
} from "../src/story/chapter-run";
import { STORY_CHAPTERS, STORY_RULES, nodeStarGoals, storyChapter, storyNode } from "../src/story/chapters";

const KITCHEN = storyChapter("kitchen-table");
const WIN = (score: number): HandOutcome => ({ won: true, score });
const LOSS: HandOutcome = { won: false, score: 30 };

function play(progress: StoryProgress, nodeId: string, outcome: HandOutcome, chapterId = "kitchen-table") {
  return recordHand(progress, chapterId, nodeId, outcome, 7);
}

/** Plays the three Kitchen Table hands, skipping every draft. */
function throughHands(progress = EMPTY_STORY_PROGRESS): StoryProgress {
  for (const id of ["first-hand", "chips-on-the-table", "word-wizard"]) {
    progress = skipDraft(play(progress, id, WIN(1)).progress, "kitchen-table");
  }
  return progress;
}

function stateOf(progress: StoryProgress, nodeId: string, chapterId = "kitchen-table") {
  const chapter = storyChapter(chapterId);
  return nodeState(progress, chapter, storyNode(chapter, nodeId));
}

describe("story config", () => {
  it("gives every chapter 15 stars but the boss-only final", () => {
    for (const chapter of STORY_CHAPTERS) {
      assert.equal(chapter.nodes.length * 3, chapter.loadout === undefined ? 15 : 3, chapter.id);
      assert.equal(chapter.nodes.at(-1)?.kind, "boss", `${chapter.id} ends on its boss`);
    }
  });
});

describe("nodeStarGoals", () => {
  it("reads First Hand's ★★ and ★★★ scores off the chapter", () => {
    const chapter = storyChapter("kitchen-table");
    assert.deepEqual(nodeStarGoals(chapter, storyNode(chapter, "first-hand")), { two: 11, three: 14 });
  });
});

describe("nodeStars", () => {
  it("counts a loss as 0, a win as 1, the threshold as 2, and 25% past it as 3", () => {
    assert.equal(nodeStars(20, LOSS), 0);
    assert.equal(nodeStars(20, WIN(19)), 1);
    assert.equal(nodeStars(20, WIN(20)), 2);
    assert.equal(nodeStars(20, WIN(24)), 2);
    assert.equal(nodeStars(20, WIN(25)), 3);
  });
});

describe("nodeState", () => {
  it("opens the hands in order, then the bonus and the boss together", () => {
    let progress = EMPTY_STORY_PROGRESS;
    assert.equal(stateOf(progress, "first-hand"), "available");
    assert.equal(stateOf(progress, "chips-on-the-table"), "locked");
    assert.equal(stateOf(progress, "professor"), "locked");

    progress = play(progress, "first-hand", WIN(1)).progress;
    assert.equal(stateOf(progress, "first-hand"), "completed");
    assert.equal(stateOf(progress, "chips-on-the-table"), "available");

    progress = throughHands(progress);
    assert.equal(stateOf(progress, "bonus"), "available");
    assert.equal(stateOf(progress, "professor"), "available");
  });

  it("keeps the path open past a lost hand, at 0★", () => {
    const { progress, stars } = play(EMPTY_STORY_PROGRESS, "first-hand", LOSS);

    assert.equal(stars, 0);
    assert.equal(stateOf(progress, "first-hand"), "completed");
    assert.equal(stateOf(progress, "chips-on-the-table"), "available");
  });

  it("locks a chapter until the boss before it is beaten", () => {
    assert.equal(stateOf(EMPTY_STORY_PROGRESS, "hand-1", "the-local"), "locked");

    const cleared = play(throughHands(), "professor", WIN(15)).progress;
    assert.equal(stateOf(cleared, "hand-1", "the-local"), "available");
  });

  it("refuses a hand at a locked node", () => {
    assert.throws(() => play(EMPTY_STORY_PROGRESS, "word-wizard", WIN(1)), RangeError);
  });
});

describe("recordHand — stars", () => {
  it("keeps a node's best stars and best score across replays", () => {
    let progress = play(EMPTY_STORY_PROGRESS, "first-hand", WIN(14)).progress;
    progress = play(progress, "first-hand", WIN(9)).progress;

    const record = chapterRecord(progress, "kitchen-table");
    assert.equal(record.stars["first-hand"], 3, "first-hand's 2★ score is 11");
    assert.equal(record.best["first-hand"], 14);
    assert.equal(chapterStars(record), 3);
  });
});

describe("recordHand — the boss", () => {
  it("needs the pot and the threshold both", () => {
    const ready = throughHands();

    assert.equal(play(ready, "professor", { won: true, score: 14 }).bossBeaten, false);
    assert.equal(play(ready, "professor", { won: false, score: 40 }).bossBeaten, false);
    assert.equal(play(ready, "professor", WIN(15)).bossBeaten, true);
  });

  it("deals a lost boss hand again, keeping the drafted powers, and hints after two in a row", () => {
    const ready = setPowers(throughHands(), ["blank_tile"]);

    const first = play(ready, "professor", LOSS);
    assert.equal(first.replayBoss, true);
    assert.equal(first.coachHint, false);
    assert.equal(stateOf(first.progress, "professor"), "available", "a boss loss records no stars");
    assert.deepEqual(chapterRecord(first.progress, "kitchen-table").powers, ["blank_tile"]);

    const second = play(first.progress, "professor", LOSS);
    assert.equal(second.coachHint, true);

    const won = play(second.progress, "professor", WIN(19));
    assert.equal(won.stars, 3);
    assert.equal(chapterRecord(won.progress, "kitchen-table").bossLosses, 0);
  });

  it("pays the reward on the first clear only", () => {
    const first = play(throughHands(), "professor", WIN(15));
    assert.deepEqual(first.reward, KITCHEN.reward);
    assert.equal(chapterRecord(first.progress, "kitchen-table").bossCleared, true);

    assert.equal(play(first.progress, "professor", WIN(20)).reward, null);
  });
});

describe("the power draft", () => {
  it("offers after a hand won, never after a hand lost, the bonus or the boss", () => {
    const afterHand = play(EMPTY_STORY_PROGRESS, "first-hand", WIN(1));
    assert.ok(afterHand.draft !== null);
    assert.deepEqual(chapterRecord(afterHand.progress, "kitchen-table").draft, afterHand.draft);

    assert.equal(play(EMPTY_STORY_PROGRESS, "first-hand", { won: false, score: 9 }).draft, null, "a lost hand pays no power");
    assert.equal(play(throughHands(), "bonus", WIN(1)).draft, null);
    assert.equal(play(throughHands(), "professor", WIN(30)).draft, null);
  });

  it("offers up to three powers from the pool that the run does not hold, the same for a seed", () => {
    const local = storyChapter("the-local");
    const offers = draftOffers(local, [], 11);

    assert.equal(offers.length, Math.min(STORY_RULES.draftOfferCount, local.powerPool.length));
    assert.deepEqual(draftOffers(local, [], 11), offers);
    assert.ok(offers.every((id) => local.powerPool.includes(id)));
    assert.deepEqual(draftOffers(KITCHEN, ["blank_tile"], 11), ["random_wild"]);
    assert.deepEqual(draftOffers(KITCHEN, ["blank_tile", "random_wild"], 11), []);
  });

  it("adds a pick below the cap and replaces one at it", () => {
    const local = "the-local";
    const opened = play(throughHands(), "professor", WIN(15)).progress;
    let progress = withDraft(setPowers(opened, ["blank_tile", "random_wild"], local), local, ["vowel_magnet"]);

    progress = pickDraft(progress, local, "vowel_magnet");
    assert.deepEqual(chapterRecord(progress, local).powers, ["blank_tile", "random_wild", "vowel_magnet"]);
    assert.equal(chapterRecord(progress, local).draft, null);

    const full = withDraft(progress, local, ["blank_tile"]);
    assert.throws(() => pickDraft(full, local, "blank_tile"), RangeError, "at the cap a pick names what it replaces");
    const swapped = pickDraft(full, local, "blank_tile", "vowel_magnet");
    assert.deepEqual(chapterRecord(swapped, local).powers, ["blank_tile", "random_wild", "blank_tile"]);
  });

  it("refuses a power the draft did not offer", () => {
    const { progress, draft } = play(EMPTY_STORY_PROGRESS, "first-hand", WIN(1));
    const missing = KITCHEN.powerPool.find((id) => !draft?.includes(id));

    assert.throws(() => pickDraft(skipDraft(progress, "kitchen-table"), "kitchen-table", draft![0]!), RangeError);
    if (missing !== undefined) assert.throws(() => pickDraft(progress, "kitchen-table", missing), RangeError);
  });
});

describe("setLoadout", () => {
  it("picks up to two different powers from the final chapter's pool", () => {
    const progress = setLoadout(EMPTY_STORY_PROGRESS, "dealers-table", ["blank_tile", "random_wild"]);
    assert.deepEqual(chapterRecord(progress, "dealers-table").powers, ["blank_tile", "random_wild"]);

    assert.throws(() => setLoadout(EMPTY_STORY_PROGRESS, "dealers-table", ["blank_tile", "blank_tile"]), RangeError);
    assert.throws(() => setLoadout(EMPTY_STORY_PROGRESS, "dealers-table", ["spotlight"]), RangeError);
    assert.throws(() => setLoadout(EMPTY_STORY_PROGRESS, "kitchen-table", ["blank_tile"]), RangeError);
  });
});

function setPowers(progress: StoryProgress, powers: StoryProgress["chapters"][string]["powers"], chapterId = "kitchen-table") {
  return { chapters: { ...progress.chapters, [chapterId]: { ...chapterRecord(progress, chapterId), powers } } };
}

function withDraft(progress: StoryProgress, chapterId: string, draft: StoryProgress["chapters"][string]["powers"]) {
  return { chapters: { ...progress.chapters, [chapterId]: { ...chapterRecord(progress, chapterId), draft } } };
}
