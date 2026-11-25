/**
 * vip.ts — VIP Points and lifetime tiers (STO-1170, `docs/rules/loyalty.md`).
 *
 * Pure like `xp.ts`: one hand's `VipHandFacts` are worth a fixed number of points, the tier
 * multiplier scales them, and the play share stops at a daily cap. Points never reset, so a
 * total names a tier for life. `packages/economy` is the one place a tier turns into coins.
 */

import type { CoinPackId, VipHandFacts } from "@wordpoker/contracts";

import type { ReplayVerified } from "./table/replay";

export interface VipTier {
  readonly name: string;
  /** Lifetime points that reach this tier. */
  readonly threshold: number;
  /** Coins paid once, on reaching it. */
  readonly reward: number;
  /** Coins added to the daily bonus each day. */
  readonly dailyBonus: number;
  /** Extra coins on a coin pack, as a whole percent. */
  readonly purchaseBonusPercent: number;
  /** Scales points earned by playing; purchase points are never multiplied. */
  readonly multiplier: number;
}

export const VIP_TIERS: readonly VipTier[] = [
  { name: "Rookie", threshold: 0, reward: 0, dailyBonus: 25, purchaseBonusPercent: 0, multiplier: 1 },
  { name: "Speller", threshold: 1_500, reward: 100, dailyBonus: 40, purchaseBonusPercent: 5, multiplier: 1.05 },
  { name: "Wordsmith", threshold: 7_500, reward: 300, dailyBonus: 60, purchaseBonusPercent: 10, multiplier: 1.1 },
  { name: "Grinder", threshold: 30_000, reward: 750, dailyBonus: 100, purchaseBonusPercent: 15, multiplier: 1.2 },
  { name: "Card Shark", threshold: 90_000, reward: 2_000, dailyBonus: 150, purchaseBonusPercent: 20, multiplier: 1.3 },
  { name: "High Roller", threshold: 225_000, reward: 5_000, dailyBonus: 250, purchaseBonusPercent: 30, multiplier: 1.4 },
  { name: "Royal Flush", threshold: 600_000, reward: 15_000, dailyBonus: 400, purchaseBonusPercent: 40, multiplier: 1.5 },
];

/** The tier at `index`; throws on an index outside `VIP_TIERS`. */
export function vipTier(index: number): VipTier {
  const tier = VIP_TIERS[index];
  if (!tier) throw new RangeError(`No VIP tier ${index}`);
  return tier;
}

/** Play points one UTC day can earn. Word and bet points are not capped. */
export const VIP_DAILY_PLAY_CAP = 600;

export const VIP_HAND_POINTS = 10;
export const VIP_SESSION_BONUS = 50;
export const VIP_SESSION_BONUS_EVERY = 10;
/** Paid when a player leaves an online table after `VIP_MATCH_MIN_HANDS`, or finishes an offline game. */
export const VIP_MATCH_POINTS = 40;
export const VIP_MATCH_MIN_HANDS = 10;
export const VIP_EVERY_TILE_BONUS = 15;
export const VIP_BEST_WORD_BONUS = 10;
export const VIP_COINS_PER_BET_POINT = 10;
export const VIP_ALL_IN_WIN_BONUS = 20;
export const VIP_BET_CAP = 50;
export const VIP_STREAK_POINTS_PER_DAY = 20;

/** Points for a coin pack, by catalog id. */
export const VIP_PURCHASE_POINTS: Readonly<Record<CoinPackId, number>> = {
  coins_small: 100,
  coins_medium: 750,
  coins_large: 2_500,
};

/** The tier a lifetime total has reached. */
export function vipTierFor(points: number): number {
  let tier = 0;
  while (tier + 1 < VIP_TIERS.length && points >= vipTier(tier + 1).threshold) tier += 1;
  return tier;
}

/** How far a total sits between its tier and the next; `next` is `null` at the top. */
export function vipProgress(points: number): { tier: number; next: number | null; toNext: number; fraction: number } {
  const tier = vipTierFor(points);
  const nextTier = VIP_TIERS[tier + 1];
  if (!nextTier) return { tier, next: null, toNext: 0, fraction: 1 };
  const floor = vipTier(tier).threshold;
  return {
    tier,
    next: tier + 1,
    toNext: nextTier.threshold - points,
    fraction: (points - floor) / (nextTier.threshold - floor),
  };
}

/** Points by word length: 4 → 2, 5 → 5, 6 → 10, 7 → 20, 8+ → 40. */
export function vipWordLengthPoints(length: number): number {
  if (length >= 8) return 40;
  return [0, 0, 0, 0, 2, 5, 10, 20][length] ?? 0;
}

/** Raw (unmultiplied, uncapped) points one hand is worth, by earn path. */
export function vipPointsForHand(facts: VipHandFacts): { play: number; word: number; bet: number } {
  const sessionBonus = facts.handInSession > 0 && facts.handInSession % VIP_SESSION_BONUS_EVERY === 0;
  const play = facts.completed ? VIP_HAND_POINTS + (sessionBonus ? VIP_SESSION_BONUS : 0) : 0;
  if (!facts.showdown) return { play, word: 0, bet: 0 };

  const word =
    vipWordLengthPoints(facts.wordLength) +
    (facts.usedEveryTile ? VIP_EVERY_TILE_BONUS : 0) +
    (facts.bestWord ? VIP_BEST_WORD_BONUS : 0);
  const bet = facts.betting
    ? Math.min(
        VIP_BET_CAP,
        Math.floor(facts.committed / VIP_COINS_PER_BET_POINT) + (facts.wonAllIn ? VIP_ALL_IN_WIN_BONUS : 0),
      )
    : 0;
  return { play, word, bet };
}

/**
 * Turns raw earned points into what is added: the tier multiplier first, then the play share
 * clamped to what is left of today's cap.
 */
export function applyVipEarn(
  raw: { play: number; word: number; bet: number },
  tier: number,
  playToday: number,
): { play: number; word: number; bet: number; added: number; playToday: number } {
  const m = VIP_TIERS[tier]?.multiplier ?? 1;
  const play = Math.min(Math.round(raw.play * m), Math.max(0, VIP_DAILY_PLAY_CAP - playToday));
  const word = Math.round(raw.word * m);
  const bet = Math.round(raw.bet * m);
  return { play, word, bet, added: play + word + bet, playToday: playToday + play };
}

/** Streak points for a login streak day: 20 × day for days 2–7, nothing on day 1. */
export function vipStreakPoints(day: number): number {
  const d = ((day - 1) % 7) + 1;
  return d >= 2 ? VIP_STREAK_POINTS_PER_DAY * d : 0;
}

/** Bonus coins a tier adds to a coin pack. */
export function vipPurchaseBonus(coins: number, tier: number): number {
  return Math.floor((coins * (VIP_TIERS[tier]?.purchaseBonusPercent ?? 0)) / 100);
}

/** Coins owed for every tier above `paidTier` up to `tier`, one entry per tier. */
export function vipTierRewards(paidTier: number, tier: number): { tier: number; coins: number }[] {
  const out: { tier: number; coins: number }[] = [];
  for (let t = paidTier + 1; t <= tier; t += 1) out.push({ tier: t, coins: vipTier(t).reward });
  return out;
}

/**
 * One seat's VIP facts from a verified hand — the replay the offline upload runs, or the one the
 * online room runs at settlement — so neither path trusts a client's account of the hand.
 * `null` for a seat that wasn't dealt in.
 */
export function vipFactsFromReplay(
  replay: ReplayVerified,
  playerId: string,
  options: { readonly betting: boolean; readonly handInSession: number },
): VipHandFacts | null {
  const seat = replay.state.seats.find((candidate) => candidate.id === playerId);
  const standing = replay.summary.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat || !standing || seat.sittingOut) return null;

  const completed = !seat.folded || replay.foldedOn[playerId] === "river";
  const word = !seat.folded && replay.summary.outcome === "showdown" ? standing.word : null;
  const plays = standing.submission?.plays.length ?? 0;
  const tiles = standing.privateTiles.length + replay.summary.community.length;
  const wonPot = replay.summary.pots.some((pot) => pot.winners.includes(playerId));

  return {
    completed,
    showdown: word !== null,
    wordLength: word?.length ?? 0,
    usedEveryTile: word !== null && plays >= tiles,
    bestWord: word !== null && standing.place === 1 && standing.score > 0,
    committed: seat.committedHand,
    wonAllIn: seat.allIn && wonPot,
    handInSession: options.handInSession,
    betting: options.betting,
  };
}
