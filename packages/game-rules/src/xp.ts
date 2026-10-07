/**
 * xp.ts — account XP, levels and level-up rewards (STO-543).
 *
 * Pure and deterministic like the rest of this package: one settled hand's facts — the same
 * `QuestHandFacts` quests judge, so a claim carries no second description of a hand — are worth
 * a fixed amount of XP, cumulative XP fills a level, and a reached level names a coin reward.
 * No I/O, no clock; `packages/economy` is the one place a level turns into coins, through the
 * Wallet's reward-once index. Numbers are the §45 starting values, tuned there or here.
 */

import type { QuestHandFacts } from "@wordpoker/contracts";

/** XP every settled hand pays its hero, win or lose. */
export const XP_PER_HAND = 10;

/** Extra XP when the hero wins the hand. */
export const XP_WIN_BONUS = 15;

/** Cumulative XP needed to reach level 2 — every later threshold scales from here. */
export const LEVEL_XP_BASE = 100;

/** Coins level 2 pays; every reached level pays a multiple of this. */
export const LEVEL_REWARD_BASE = 50;

/** XP one settled hand pays its hero: for playing it, for winning it, and its word points. */
export function xpForHand(facts: QuestHandFacts): number {
  return XP_PER_HAND + (facts.heroWon ? XP_WIN_BONUS : 0) + facts.heroScore;
}

/**
 * Cumulative XP needed to reach `level`: `100 * (level - 1)^1.5`, rounded so every threshold —
 * and therefore every `intoLevel`/`toNext` pair — stays whole.
 */
export function xpToReach(level: number): number {
  return Math.round(LEVEL_XP_BASE * (level - 1) ** 1.5);
}

/** Where an XP total sits on the level curve: the level it is filling and how far along. */
export interface LevelStanding {
  /** The level `xp` is currently filling; 1 from the first tile until 100 XP. */
  readonly level: number;
  /** XP earned into the current level. */
  readonly intoLevel: number;
  /** XP still needed for the next level. */
  readonly toNext: number;
}

/** Reads a player's XP total against the level curve. A jump past several thresholds lands on the highest. */
export function levelForXp(xp: number): LevelStanding {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level += 1;

  return { level, intoLevel: xp - xpToReach(level), toNext: xpToReach(level + 1) - xp };
}

/** Coins a reached level pays: `50 * level`, doubled on every 5th level (5, 10, 15 …). */
export function levelReward(level: number): number {
  return level % 5 === 0 ? LEVEL_REWARD_BASE * 2 * level : LEVEL_REWARD_BASE * level;
}
