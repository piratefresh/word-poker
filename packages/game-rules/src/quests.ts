/**
 * Quests: the catalog of coin-paying goals and the pure evaluator that judges one settled hand
 * against a player's progress (QUESTS_LOGIN_STREAK_PLAN.md).
 *
 * Pure and deterministic like the rest of this package (AGENTS.md): `applyQuestHand` takes the
 * progress a player already has and one hand's facts, and returns the next progress plus
 * whichever quests that hand completed. No I/O, no clock, no RNG — `packages/economy` is the one
 * place a completion turns into coins.
 */

import type { QuestHandFacts, QuestId } from "@wordpoker/contracts";
import { QUEST_IDS } from "@wordpoker/contracts";

/** One quest the catalog can pay: its goal (1 = one-shot) and its coin reward. */
export interface QuestDefinition {
  readonly id: QuestId;
  readonly title: string;
  readonly description: string;
  readonly goal: number;
  readonly reward: number;
}

/** The fifteen quests, in catalog order. Retuning a goal or reward is a data-only change. */
export const QUEST_CATALOG: readonly QuestDefinition[] = [
  { id: "win-word-2", title: "SHORT AND SWEET", description: "Win a showdown with a 2-letter word.", goal: 1, reward: 100 },
  { id: "win-word-3", title: "TRIPLE THREAT", description: "Win a showdown with a 3-letter word.", goal: 1, reward: 75 },
  { id: "win-word-4", title: "FOURS ARE WILD", description: "Win a showdown with a 4-letter word.", goal: 1, reward: 75 },
  { id: "win-word-5", title: "HIGH FIVE", description: "Win a showdown with a 5-letter word.", goal: 1, reward: 100 },
  { id: "win-word-6", title: "SIX SHOOTER", description: "Win a showdown with a 6-letter word.", goal: 1, reward: 150 },
  { id: "win-word-7", title: "FULL RACK", description: "Win a showdown using all seven tiles.", goal: 1, reward: 250 },
  { id: "word-25", title: "HEAVY HITTER", description: "Win a showdown with a word worth 25+ points.", goal: 1, reward: 200 },
  { id: "heavy-letter", title: "RARE FIND", description: "Play a word containing a J, X, Q or Z.", goal: 1, reward: 100 },
  { id: "pot-500", title: "POT SNATCHER", description: "Win a pot worth more than 500 chips.", goal: 1, reward: 200 },
  { id: "fold-out", title: "LAST ONE STANDING", description: "Win a hand where every other seat folded.", goal: 1, reward: 150 },
  { id: "tile-draw", title: "LUCK OF THE DRAW", description: "Win first place on the tiebreaking tile draw.", goal: 1, reward: 150 },
  { id: "wild-power-win", title: "POWER PLAY", description: "Win a hand at a Wild table after using your power.", goal: 1, reward: 150 },
  { id: "hands-25", title: "NIGHT OUT", description: "Play 25 hands.", goal: 25, reward: 100 },
  { id: "wins-10", title: "WINNER WINNER", description: "Win 10 hands.", goal: 10, reward: 150 },
  { id: "win-streak-3", title: "ON A ROLL", description: "Win 3 hands in a row.", goal: 3, reward: 200 },
];

/** One quest's stored progress: how far along it is, its own running streak, and whether it paid. */
export interface QuestProgressEntry {
  readonly progress: number;
  readonly streak: number;
  readonly done: boolean;
}

export type QuestProgressMap = Record<QuestId, QuestProgressEntry>;

const EMPTY_ENTRY: QuestProgressEntry = { progress: 0, streak: 0, done: false };

/** Every quest at zero — a player who has not yet played a hand. */
export function emptyQuestProgress(): QuestProgressMap {
  const map = {} as QuestProgressMap;
  for (const id of QUEST_IDS) map[id] = EMPTY_ENTRY;
  return map;
}

/** Whether a word-length ladder quest's length matches the hero's showdown word. */
function wordLengthWon(facts: QuestHandFacts, length: number): boolean {
  return facts.revealed && facts.heroWon && facts.heroWord !== null && facts.heroWord.length === length;
}

const HEAVY_LETTERS = /[JXQZ]/;

/** Whether one hand's facts complete (or further) a one-shot quest — everything but the two counters. */
function oneShotMatch(id: QuestId, facts: QuestHandFacts): boolean {
  switch (id) {
    case "win-word-2":
      return wordLengthWon(facts, 2);
    case "win-word-3":
      return wordLengthWon(facts, 3);
    case "win-word-4":
      return wordLengthWon(facts, 4);
    case "win-word-5":
      return wordLengthWon(facts, 5);
    case "win-word-6":
      return wordLengthWon(facts, 6);
    case "win-word-7":
      return wordLengthWon(facts, 7);
    case "word-25":
      return facts.revealed && facts.heroWon && facts.heroScore >= 25;
    case "heavy-letter":
      return facts.revealed && facts.heroWord !== null && HEAVY_LETTERS.test(facts.heroWord);
    case "pot-500":
      return facts.heroWon && facts.pot > 500;
    case "fold-out":
      return !facts.revealed && facts.heroWon;
    case "tile-draw":
      return facts.revealed && facts.heroWon && facts.heroDecidedBy === "tile-draw";
    case "wild-power-win":
      return facts.heroWon && facts.wildTable && facts.heroUsedPower;
    default:
      return false;
  }
}

/** Pure: one hand's effect on the whole map, and the quests this hand completed. */
export function applyQuestHand(
  map: QuestProgressMap,
  facts: QuestHandFacts,
): { next: QuestProgressMap; completed: readonly QuestId[] } {
  const next = {} as QuestProgressMap;
  const completed: QuestId[] = [];

  for (const def of QUEST_CATALOG) {
    const entry = map[def.id] ?? EMPTY_ENTRY;
    if (entry.done) {
      next[def.id] = entry;
      continue;
    }

    const updated = nextEntry(def, entry, facts);
    next[def.id] = updated;
    if (updated.done) completed.push(def.id);
  }

  return { next, completed };
}

function nextEntry(def: QuestDefinition, entry: QuestProgressEntry, facts: QuestHandFacts): QuestProgressEntry {
  if (def.id === "win-streak-3") {
    const streak = facts.heroWon ? entry.streak + 1 : 0;
    const progress = Math.max(entry.progress, streak);
    return { progress, streak, done: progress >= def.goal };
  }

  if (def.id === "hands-25") {
    const progress = entry.progress + 1;
    return { ...entry, progress, done: progress >= def.goal };
  }

  if (def.id === "wins-10") {
    const progress = facts.heroWon ? entry.progress + 1 : entry.progress;
    return { ...entry, progress, done: progress >= def.goal };
  }

  // Every other quest is one-shot: it either completes this hand or stays exactly as it was.
  if (oneShotMatch(def.id, facts)) return { progress: def.goal, streak: 0, done: true };
  return entry;
}
