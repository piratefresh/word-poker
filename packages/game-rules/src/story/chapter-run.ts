/**
 * chapter-run.ts — one story chapter's run (STO-973, `docs/rules/story-mode.md`): which nodes are
 * open, the stars a hand earns, the power draft after each hand, and the boss's retry and coach
 * hint. Pure like the rest of the engine: the hand itself is the ordinary offline table, and what
 * comes back from it (won the pot, the word's score) is all the run reads. The draft's seed comes
 * from the caller.
 *
 * `StoryProgress` is the whole save: the app stores it as it is and hands it back.
 */

import type { PowerUpId } from "@wordpoker/contracts";

import { createRng } from "../core/rng";
import { weightedSampleWithoutReplacement } from "../core/sample";
import {
  STORY_CHAPTERS,
  STORY_RULES,
  nodeThreshold,
  storyChapter,
  storyNode,
  type StoryChapter,
  type StoryNode,
} from "./chapters";

/** One chapter's save: the map's stars and the run in progress. */
export interface ChapterRecord {
  /** Best stars per node played. A node with an entry is behind the player — a lost hand records 0. */
  readonly stars: Readonly<Record<string, number>>;
  /** Best word score per node played. */
  readonly best: Readonly<Record<string, number>>;
  /** The boss has been beaten at least once: the first-clear reward is spent. */
  readonly bossCleared: boolean;
  /** The drafted powers, held for the whole chapter and offered at the start of every hand. */
  readonly powers: readonly PowerUpId[];
  /** A draft waiting on its pick, kept so reopening the app cannot reroll it. */
  readonly draft: readonly PowerUpId[] | null;
  /** Boss hands lost since the last boss win. */
  readonly bossLosses: number;
}

export interface StoryProgress {
  readonly chapters: Readonly<Record<string, ChapterRecord>>;
  /**
   * Every power a draft or loadout has shown, so the coach introduces each one once (STO-975).
   * Absent in a save from before it was kept, which reads as nothing shown yet.
   */
  readonly powersSeen?: readonly PowerUpId[];
}

export const EMPTY_STORY_PROGRESS: StoryProgress = { chapters: {} };

const EMPTY_RECORD: ChapterRecord = { stars: {}, best: {}, bossCleared: false, powers: [], draft: null, bossLosses: 0 };

export function chapterRecord(progress: StoryProgress, chapterId: string): ChapterRecord {
  return progress.chapters[chapterId] ?? EMPTY_RECORD;
}

function withRecord(progress: StoryProgress, chapterId: string, record: ChapterRecord): StoryProgress {
  return { ...progress, chapters: { ...progress.chapters, [chapterId]: record } };
}

/** The powers in `offers` the coach has not introduced yet, in their order. */
export function newPowers(progress: StoryProgress, offers: readonly PowerUpId[]): PowerUpId[] {
  const seen = progress.powersSeen ?? [];
  return offers.filter((id) => !seen.includes(id));
}

/** Notes `shown` as introduced, so the coach does not introduce them again. */
export function seePowers(progress: StoryProgress, shown: readonly PowerUpId[]): StoryProgress {
  const fresh = newPowers(progress, shown);
  return fresh.length === 0 ? progress : { ...progress, powersSeen: [...(progress.powersSeen ?? []), ...fresh] };
}

/** 0★ lost · 1★ won · 2★ won at the threshold · 3★ won beating it by the margin. */
export function nodeStars(threshold: number, outcome: HandOutcome): number {
  if (!outcome.won) return 0;
  if (outcome.score >= threshold * (1 + STORY_RULES.threeStarMargin)) return 3;
  return outcome.score >= threshold ? 2 : 1;
}

export function chapterStars(record: ChapterRecord): number {
  return Object.values(record.stars).reduce((sum, stars) => sum + stars, 0);
}

/** The first chapter is open from the start; each later one once the boss before it is beaten. */
export function chapterUnlocked(progress: StoryProgress, chapter: StoryChapter): boolean {
  const index = STORY_CHAPTERS.indexOf(chapter);
  const before = STORY_CHAPTERS[index - 1];
  return before === undefined || chapterRecord(progress, before.id).bossCleared;
}

export type StoryNodeState = "locked" | "available" | "completed";

/** Hands open one after another; the bonus and the boss both open once every hand is played. */
export function nodeState(progress: StoryProgress, chapter: StoryChapter, node: StoryNode): StoryNodeState {
  if (!chapterUnlocked(progress, chapter)) return "locked";
  const record = chapterRecord(progress, chapter.id);
  if (record.stars[node.id] !== undefined) return "completed";
  const hands = chapter.nodes.filter((candidate) => candidate.kind === "hand");
  if (node.kind !== "hand") return hands.every((hand) => record.stars[hand.id] !== undefined) ? "available" : "locked";
  const before = hands[hands.indexOf(node) - 1];
  return before === undefined || record.stars[before.id] !== undefined ? "available" : "locked";
}

/** What the hand at a node came to. */
export interface HandOutcome {
  /** The hero took the pot (a share of a split pot counts). */
  readonly won: boolean;
  /** The hero's word score for the hand; 0 with no word. */
  readonly score: number;
}

export interface RecordedHand {
  readonly progress: StoryProgress;
  readonly stars: number;
  /** A boss hand won: the pot and the threshold both. */
  readonly bossBeaten: boolean;
  /** Paid on the boss's first clear only. */
  readonly reward: StoryChapter["reward"] | null;
  /** A boss hand lost: the run deals it again, keeping the drafted powers. */
  readonly replayBoss: boolean;
  /** The boss has now been lost `coachHintAfterBossLosses` times or more in a row. */
  readonly coachHint: boolean;
  /** The draft a hand node offers; `null` when the pool has nothing left to offer. */
  readonly draft: readonly PowerUpId[] | null;
}

/**
 * Records a hand at an open node. Stars keep their best; a boss hand counts only when won at
 * the threshold, and is otherwise dealt again. A hand node won opens a draft.
 *
 * @param seed Seeds the draft's offers.
 * @throws {RangeError} For an unknown chapter or node, or a node still locked.
 */
export function recordHand(
  progress: StoryProgress,
  chapterId: string,
  nodeId: string,
  outcome: HandOutcome,
  seed: number,
): RecordedHand {
  const chapter = storyChapter(chapterId);
  const node = storyNode(chapter, nodeId);
  if (nodeState(progress, chapter, node) === "locked") {
    throw new RangeError(`Node "${nodeId}" of "${chapterId}" is locked.`);
  }
  const record = chapterRecord(progress, chapterId);
  const threshold = nodeThreshold(chapter, node);
  const stars = nodeStars(threshold, outcome);
  const keepBest = (): Pick<ChapterRecord, "stars" | "best"> => ({
    stars: { ...record.stars, [nodeId]: Math.max(stars, record.stars[nodeId] ?? 0) },
    best: { ...record.best, [nodeId]: Math.max(outcome.score, record.best[nodeId] ?? 0) },
  });

  if (node.kind === "boss") {
    const bossBeaten = outcome.won && outcome.score >= threshold;
    if (!bossBeaten) {
      const bossLosses = record.bossLosses + 1;
      return {
        progress: withRecord(progress, chapterId, { ...record, bossLosses }),
        stars: 0,
        bossBeaten,
        reward: null,
        replayBoss: true,
        coachHint: bossLosses >= STORY_RULES.coachHintAfterBossLosses,
        draft: null,
      };
    }
    const next: ChapterRecord = { ...record, ...keepBest(), bossCleared: true, bossLosses: 0 };
    return {
      progress: withRecord(progress, chapterId, next),
      stars,
      bossBeaten,
      reward: record.bossCleared ? null : chapter.reward,
      replayBoss: false,
      coachHint: false,
      draft: null,
    };
  }

  // A power is the reward for a hand won: a lost hand is dealt again, not paid.
  const offers = node.kind === "hand" && outcome.won ? draftOffers(chapter, record.powers, seed) : [];
  const draft = offers.length > 0 ? offers : null;
  return {
    progress: withRecord(progress, chapterId, { ...record, ...keepBest(), draft: draft ?? record.draft }),
    stars,
    bossBeaten: false,
    reward: null,
    replayBoss: false,
    coachHint: false,
    draft,
  };
}

/**
 * Up to `draftOfferCount` powers from the chapter's pool that the run does not hold yet, drawn
 * by the catalog's weight. Every power held means nothing to offer.
 */
export function draftOffers(chapter: StoryChapter, held: readonly PowerUpId[], seed: number): PowerUpId[] {
  const pool = chapter.powerPool.filter((id) => !held.includes(id));
  return weightedSampleWithoutReplacement(pool, () => 1, STORY_RULES.draftOfferCount, createRng(seed));
}

/**
 * Keeps one of the waiting draft's offers. Below the cap it is added; at the cap it takes the
 * place of `replacing`.
 *
 * @throws {RangeError} With no draft waiting, for a power it did not offer, or at the cap
 *   without a held power to replace.
 */
export function pickDraft(
  progress: StoryProgress,
  chapterId: string,
  power: PowerUpId,
  replacing?: PowerUpId,
): StoryProgress {
  const record = chapterRecord(progress, chapterId);
  if (record.draft === null || !record.draft.includes(power)) {
    throw new RangeError(`"${power}" is not on offer in "${chapterId}".`);
  }
  if (record.powers.length < STORY_RULES.heldPowerCap) {
    return withRecord(progress, chapterId, { ...record, powers: [...record.powers, power], draft: null });
  }
  if (replacing === undefined || !record.powers.includes(replacing)) {
    throw new RangeError(`Holding ${STORY_RULES.heldPowerCap} powers: pick one to replace.`);
  }
  const powers = record.powers.map((held) => (held === replacing ? power : held));
  return withRecord(progress, chapterId, { ...record, powers, draft: null });
}

/** Passes on the waiting draft, keeping the powers held. */
export function skipDraft(progress: StoryProgress, chapterId: string): StoryProgress {
  return withRecord(progress, chapterId, { ...chapterRecord(progress, chapterId), draft: null });
}

/**
 * Sets a loadout chapter's powers (the final chapter: pick up to 2 before the boss hand).
 *
 * @throws {RangeError} For a chapter without a loadout, a power outside its pool, a repeat, or
 *   more powers than the loadout holds.
 */
export function setLoadout(progress: StoryProgress, chapterId: string, powers: readonly PowerUpId[]): StoryProgress {
  const chapter = storyChapter(chapterId);
  if (chapter.loadout === undefined) throw new RangeError(`"${chapterId}" drafts its powers.`);
  if (powers.length > chapter.loadout || new Set(powers).size !== powers.length) {
    throw new RangeError(`A loadout is up to ${chapter.loadout} different powers.`);
  }
  if (!powers.every((id) => chapter.powerPool.includes(id))) {
    throw new RangeError(`A loadout picks from "${chapterId}"'s pool.`);
  }
  return withRecord(progress, chapterId, { ...chapterRecord(progress, chapterId), powers: [...powers] });
}
