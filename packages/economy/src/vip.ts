/**
 * vip.ts — turning VIP Points into tiers and tiers into coins (STO-1170, `docs/rules/loyalty.md`).
 *
 * Points live in `vip_progress` (`@wordpoker/db`), judged by the pure rules in
 * `@wordpoker/game-rules`. Every award carries a token, so a retried hand, a repeated daily GET
 * or a replayed webhook adds nothing twice; every coin goes through `applyWalletChange`, whose
 * reward-once index pays each tier, each day's bonus and each purchase bonus exactly once.
 */

import { isCoinPackId, type VipAward, type VipHandFacts, type VipState } from "@wordpoker/contracts";
import {
  recordVipPoints as recordVipPointsDb,
  setVipTierPaid as setVipTierPaidDb,
  vipProgress as vipProgressDb,
  type VipEarnInput,
  type VipEarnResult,
  type VipProgressRecord,
} from "@wordpoker/db";
import {
  VIP_MATCH_POINTS,
  VIP_PURCHASE_POINTS,
  applyVipEarn,
  vipPointsForHand,
  vipPurchaseBonus,
  vipStreakPoints,
  vipTier,
  vipTierFor,
  vipTierRewards,
} from "@wordpoker/game-rules";

import { applyWalletChange, type WalletDeps } from "./wallet";

/** The VIP reads and writes this module needs; the database's by default, a fake in tests. */
export interface VipStore {
  vipProgress(userId: string, day: string): Promise<VipProgressRecord>;
  recordVipPoints(
    userId: string,
    token: string,
    day: string,
    apply: (current: VipEarnInput) => VipEarnResult,
  ): Promise<VipProgressRecord & { duplicate: boolean; added: number }>;
  setVipTierPaid(userId: string, tier: number): Promise<void>;
}

export interface VipDeps extends WalletDeps {
  readonly vip?: VipStore;
  readonly now?: Date;
}

const databaseVipStore: VipStore = {
  vipProgress: (userId, day) => vipProgressDb(userId, day),
  recordVipPoints: (userId, token, day, apply) => recordVipPointsDb(userId, token, day, apply),
  setVipTierPaid: (userId, tier) => setVipTierPaidDb(userId, tier),
};

/** The UTC calendar day VIP's daily cap and bonus key to. */
export function vipDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toState(record: { points: number; playToday: number }): VipState {
  return { points: record.points, tier: vipTierFor(record.points), playToday: record.playToday };
}

/**
 * Pays every tier above `paidTier` up to the one `points` reaches, then moves the high-water
 * mark. Safe to repeat: each tier's `vip_tier` wallet event is held by the reward-once index.
 */
export async function payVipTierUps(
  userId: string,
  paidTier: number,
  points: number,
  deps: VipDeps = {},
): Promise<VipAward["tierUp"]> {
  const vip = deps.vip ?? databaseVipStore;
  const tier = vipTierFor(points);
  const owed = vipTierRewards(paidTier, tier);
  if (owed.length === 0) return null;

  let coins = 0;
  for (const reward of owed) {
    await applyWalletChange(userId, "vip_tier", reward.coins, { ref: `tier-${reward.tier}` }, deps);
    coins += reward.coins;
  }
  await vip.setVipTierPaid(userId, tier);
  return { tier, coins };
}

async function earn(
  userId: string,
  token: string,
  raw: { play: number; word: number; bet: number },
  deps: VipDeps,
): Promise<VipAward> {
  const vip = deps.vip ?? databaseVipStore;
  let split = { play: 0, word: 0, bet: 0 };
  const result = await vip.recordVipPoints(userId, token, vipDay(deps.now), ({ points, playToday }) => {
    const earned = applyVipEarn(raw, vipTierFor(points), playToday);
    split = { play: earned.play, word: earned.word, bet: earned.bet };
    return { added: earned.added, playToday: earned.playToday };
  });
  const tierUp = await payVipTierUps(userId, result.tierPaid, result.points, deps);
  return { added: result.added, ...split, state: toState(result), tierUp };
}

/** Flat points (streak, purchase): never multiplied, never capped. */
async function addFlat(userId: string, token: string, points: number, deps: VipDeps): Promise<VipAward> {
  const vip = deps.vip ?? databaseVipStore;
  const result = await vip.recordVipPoints(userId, token, vipDay(deps.now), ({ playToday }) => ({
    added: points,
    playToday,
  }));
  const tierUp = await payVipTierUps(userId, result.tierPaid, result.points, deps);
  return { added: result.added, play: 0, word: 0, bet: 0, state: toState(result), tierUp };
}

/** Points for one settled hand, once per `handToken` (`sessionId:handNo`). */
export function awardVipHand(userId: string, handToken: string, facts: VipHandFacts, deps: VipDeps = {}): Promise<VipAward> {
  return earn(userId, `hand:${handToken}`, vipPointsForHand(facts), deps);
}

/** The finish-a-match bonus, once per `matchToken`: a play point, so multiplied and capped. */
export function awardVipMatch(userId: string, matchToken: string, deps: VipDeps = {}): Promise<VipAward> {
  return earn(userId, `match:${matchToken}`, { play: VIP_MATCH_POINTS, word: 0, bet: 0 }, deps);
}

/**
 * The tier's daily bonus coins and the streak's VIP Points for `streakDay`, once per UTC day.
 * `coins` is what this call paid, or `null` when today was already paid or RevenueCat was down.
 */
export async function creditVipDaily(
  userId: string,
  streakDay: number,
  deps: VipDeps = {},
): Promise<{ coins: number | null; award: VipAward }> {
  const vip = deps.vip ?? databaseVipStore;
  const day = vipDay(deps.now);
  const { points } = await vip.vipProgress(userId, day);
  const bonus = vipTier(vipTierFor(points)).dailyBonus;
  const paid = await applyWalletChange(userId, "vip_daily", bonus, { ref: day }, deps);
  const award = await addFlat(userId, `streak:${day}`, vipStreakPoints(streakDay), deps);
  return { coins: paid.applied ? bonus : null, award };
}

/**
 * A confirmed coin-pack purchase: the tier's bonus coins (at the tier held when buying) and the
 * pack's VIP Points, once per RevenueCat event.
 */
export async function awardVipPurchase(
  userId: string,
  purchase: { readonly eventId: string; readonly productId: string | null; readonly coins: number },
  deps: VipDeps = {},
): Promise<VipAward | null> {
  if (!purchase.productId || !isCoinPackId(purchase.productId) || purchase.coins <= 0) return null;
  const vip = deps.vip ?? databaseVipStore;
  const { points } = await vip.vipProgress(userId, vipDay(deps.now));
  const bonus = vipPurchaseBonus(purchase.coins, vipTierFor(points));
  if (bonus > 0) {
    await applyWalletChange(
      userId,
      "vip_purchase_bonus",
      bonus,
      { ref: purchase.eventId, productId: purchase.productId },
      deps,
    );
  }
  return addFlat(userId, `purchase:${purchase.eventId}`, VIP_PURCHASE_POINTS[purchase.productId], deps);
}

/** A player's standing, healing any tier reward an earlier crash left unpaid. */
export async function vipState(userId: string, deps: VipDeps = {}): Promise<VipState> {
  const vip = deps.vip ?? databaseVipStore;
  const record = await vip.vipProgress(userId, vipDay(deps.now));
  await payVipTierUps(userId, record.tierPaid, record.points, deps);
  return toState(record);
}
