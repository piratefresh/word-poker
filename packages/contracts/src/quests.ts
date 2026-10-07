/**
 * Quests & the login streak on the wire (QUESTS_LOGIN_STREAK_PLAN.md).
 *
 * The balance is not here — `GET /api/wallet` owns it (`coins.ts`). This is the vocabulary
 * for a hand's quest facts, a claim of them, and the two routes' responses; `packages/game-rules`
 * imports `QuestId` and `QuestHandFacts` from here so the catalog and its evaluator share one
 * definition of what a quest is and what it is judged against.
 */

import type { ShowdownDecider } from "./showdown";

/** Every quest the catalog can pay, in the order `QUEST_CATALOG` defines them. */
export const QUEST_IDS = [
  "win-word-2",
  "win-word-3",
  "win-word-4",
  "win-word-5",
  "win-word-6",
  "win-word-7",
  "word-25",
  "heavy-letter",
  "pot-500",
  "fold-out",
  "tile-draw",
  "wild-power-win",
  "hands-25",
  "wins-10",
  "win-streak-3",
] as const;

export type QuestId = (typeof QUEST_IDS)[number];

export function isQuestId(value: unknown): value is QuestId {
  return (QUEST_IDS as readonly unknown[]).includes(value);
}

/** One settled hand, from the hero's chair — the only input quest judging gets. */
export interface QuestHandFacts {
  readonly revealed: boolean;
  readonly heroWon: boolean;
  /** Uppercase, or `null` when the hero confirmed no word. */
  readonly heroWord: string | null;
  readonly heroScore: number;
  readonly heroDecidedBy: ShowdownDecider | null;
  readonly pot: number;
  readonly wildTable: boolean;
  readonly heroUsedPower: boolean;
}

/** Coins for day 1…7 of the streak; day 8 starts the cycle again. */
export const STREAK_REWARDS = [50, 75, 100, 125, 150, 200, 300] as const;

/**
 * The largest word score a claim may report. Seven tiles of the best letters with multipliers
 * land far below this; the bound keeps a hostile claim from moving the XP column (STO-543).
 */
export const MAX_HERO_SCORE = 999;

/** POSTed once per settled hand. */
export interface QuestHandClaim {
  readonly handToken: string;
  readonly facts: QuestHandFacts;
}

/** `GET /api/quests`. */
export interface QuestStateResponse {
  readonly streak: {
    readonly current: number;
    /** The reward paid by this GET, or `null` when today was already credited. */
    readonly creditedToday: number | null;
  };
  /** The player's XP total, and the level that total is filling (`levelForXp`). */
  readonly xp: number;
  readonly level: number;
  readonly quests: readonly { readonly id: QuestId; readonly progress: number; readonly done: boolean }[];
}

/** `POST /api/quests`. */
export interface QuestClaimResponse {
  readonly completed: readonly QuestId[];
  readonly duplicate: boolean;
  /** The player's XP total after this hand, and the level it reaches — a duplicate reports the current ones. */
  readonly xp: number;
  readonly level: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const SHOWDOWN_DECIDER_VALUES: readonly string[] = ["final-score", "word-length", "tile-draw"];

function isShowdownDeciderOrNull(value: unknown): value is ShowdownDecider | null {
  return value === null || SHOWDOWN_DECIDER_VALUES.includes(value as string);
}

function isQuestHandFacts(value: unknown): value is QuestHandFacts {
  if (!isRecord(value)) return false;
  return (
    typeof value.revealed === "boolean" &&
    typeof value.heroWon === "boolean" &&
    (value.heroWord === null || typeof value.heroWord === "string") &&
    typeof value.heroScore === "number" &&
    Number.isInteger(value.heroScore) &&
    value.heroScore >= 0 &&
    value.heroScore <= MAX_HERO_SCORE &&
    isShowdownDeciderOrNull(value.heroDecidedBy) &&
    typeof value.pot === "number" &&
    Number.isFinite(value.pot) &&
    typeof value.wildTable === "boolean" &&
    typeof value.heroUsedPower === "boolean"
  );
}

/** Whether an untrusted body has the shape of a `POST /api/quests` claim. */
export function isQuestHandClaim(value: unknown): value is QuestHandClaim {
  if (!isRecord(value)) return false;
  return (
    typeof value.handToken === "string" &&
    value.handToken.length > 0 &&
    isQuestHandFacts(value.facts)
  );
}

function isQuestProgressEntry(value: unknown): value is QuestStateResponse["quests"][number] {
  if (!isRecord(value)) return false;
  return (
    isQuestId(value.id) &&
    typeof value.progress === "number" &&
    Number.isFinite(value.progress) &&
    typeof value.done === "boolean"
  );
}

/** A whole, non-negative count — an XP total or a level as the routes report them. */
function isXpCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isQuestStateResponse(value: unknown): value is QuestStateResponse {
  if (!isRecord(value) || !isRecord(value.streak) || !Array.isArray(value.quests)) return false;
  const { streak } = value;
  return (
    typeof streak.current === "number" &&
    Number.isFinite(streak.current) &&
    (streak.creditedToday === null ||
      (typeof streak.creditedToday === "number" && Number.isFinite(streak.creditedToday))) &&
    isXpCount(value.xp) &&
    isXpCount(value.level) &&
    value.level >= 1 &&
    value.quests.every(isQuestProgressEntry)
  );
}

export function isQuestClaimResponse(value: unknown): value is QuestClaimResponse {
  if (!isRecord(value) || !Array.isArray(value.completed) || typeof value.duplicate !== "boolean") {
    return false;
  }
  return isXpCount(value.xp) && isXpCount(value.level) && value.level >= 1 && value.completed.every(isQuestId);
}
