/**
 * rewards.ts — turning a settled hand or a day's first visit into coins (STO-525, STO-543).
 *
 * Neither path invents state of its own: a hand's quest progress lives in `quest_progress`
 * (`@wordpoker/db`), judged by the pure evaluator in `@wordpoker/game-rules`, the login
 * streak is read straight off the player's `streak` wallet events, and a level is whatever the
 * player's XP total says it is — there is no `login_streak` table and no level ledger to drift
 * out of sync. Every coin either path pays still goes through `applyWalletChange`, so a reward
 * is a `wallet_event` row like any other, and the once-only rule is that table's own unique
 * index, not something this module has to re-implement.
 */

import {
  STREAK_REWARDS,
  type QuestClaimResponse,
  type QuestHandClaim,
  type QuestId,
} from "@wordpoker/contracts";
import {
  playerProgress as playerProgressDb,
  questProgress as questProgressDb,
  recordQuestHand as recordQuestHandDb,
  setLevelPaid as setLevelPaidDb,
  streakDates as streakDatesDb,
  type PlayerProgressRecord,
  type QuestProgressMap,
  type QuestProgressRecord,
} from "@wordpoker/db";
import { QUEST_CATALOG, applyQuestHand, levelForXp, levelReward, xpForHand } from "@wordpoker/game-rules";

import { applyWalletChange } from "./wallet";
import type { WalletDeps } from "./wallet";

/** The quest-side reads and writes this module needs; the database's by default, a fake in tests. */
export interface QuestStore {
  streakDates(userId: string): Promise<string[]>;
  recordQuestHand(
    userId: string,
    handToken: string,
    apply: (map: QuestProgressMap) => { next: QuestProgressMap; completed: readonly QuestId[] },
    xp: number,
  ): Promise<{ completed: readonly QuestId[]; duplicate: boolean; xp: number }>;
  questProgress(userId: string): Promise<QuestProgressRecord[]>;
  playerProgress(userId: string): Promise<PlayerProgressRecord>;
  setLevelPaid(userId: string, level: number): Promise<void>;
}

export interface RewardsDeps extends WalletDeps {
  readonly quests?: QuestStore;
}

const databaseQuestStore: QuestStore = {
  streakDates: (userId) => streakDatesDb(userId),
  recordQuestHand: (userId, handToken, apply, xp) => recordQuestHandDb(userId, handToken, apply, xp),
  questProgress: (userId) => questProgressDb(userId),
  playerProgress: (userId) => playerProgressDb(userId),
  setLevelPaid: (userId, level) => setLevelPaidDb(userId, level),
};

function questReward(id: QuestId): number {
  const def = QUEST_CATALOG.find((candidate) => candidate.id === id);
  // Every catalog id has a definition (STO-525's game-rules test asserts it); this is the
  // defensive floor for a reward this module cannot name.
  return def?.reward ?? 0;
}

/** Today's UTC calendar date, `YYYY-MM-DD`. */
function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The UTC calendar date one day before `date` (`YYYY-MM-DD` in, `YYYY-MM-DD` out). */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDate(d);
}

/**
 * The length of the run of consecutive days ending at `today`, duplicates in `dates` collapsed.
 * Pure: no clock of its own, so a caller that wants "today" counted passes it in `dates` too.
 */
export function streakLength(dates: readonly string[], today: string): number {
  const days = new Set(dates);
  let length = 0;
  let cursor = today;

  while (days.has(cursor)) {
    length += 1;
    cursor = dayBefore(cursor);
  }

  return length;
}

/**
 * Credits today's login streak, once. `current` is today's streak length whether or not this
 * call is the one that paid it; `creditedToday` is the reward *this call* paid, or `null` when
 * today was already credited (a repeat `GET`) or RevenueCat could not be reached (the row stays
 * `pending`, and `GET /api/wallet`'s `retryPending` resolves it — not this module).
 */
export async function creditDailyStreak(
  userId: string,
  now: Date = new Date(),
  deps: RewardsDeps = {},
): Promise<{ current: number; creditedToday: number | null }> {
  const quests = deps.quests ?? databaseQuestStore;
  const today = utcDate(now);
  const dates = await quests.streakDates(userId);
  const day = streakLength([today, ...dates], today);
  const reward = STREAK_REWARDS[(day - 1) % STREAK_REWARDS.length] ?? STREAK_REWARDS[0];

  const result = await applyWalletChange(userId, "streak", reward, { ref: today }, deps);

  return { current: day, creditedToday: result.applied ? reward : null };
}

/**
 * Pays every level in `(paidThrough, level]` and advances the player's high-water mark. The
 * claim path and the GET heal run this one rule, so a crash between an XP commit and its
 * wallet calls is healed by whichever runs next; each level's `wallet_event` row is held by
 * the reward-once index either way, and `levelPaid` only keeps the everyday run at zero extra
 * queries.
 */
async function payLevelUps(
  quests: QuestStore,
  userId: string,
  paidThrough: number,
  level: number,
  deps: RewardsDeps,
): Promise<void> {
  for (let crossed = paidThrough + 1; crossed <= level; crossed += 1) {
    await applyWalletChange(userId, "level", levelReward(crossed), { ref: `level-${crossed}` }, deps);
  }
  if (level > paidThrough) await quests.setLevelPaid(userId, level);
}

/**
 * Records one settled hand, pays every level its XP reaches, and pays every quest it completed.
 * A duplicate claim pays nothing — but still heals any level an earlier crash left unpaid.
 */
export async function claimQuestHand(
  userId: string,
  claim: QuestHandClaim,
  deps: RewardsDeps = {},
): Promise<QuestClaimResponse> {
  const quests = deps.quests ?? databaseQuestStore;
  const before = await quests.playerProgress(userId);
  const { completed, duplicate, xp } = await quests.recordQuestHand(
    userId,
    claim.handToken,
    (map) => applyQuestHand(map, claim.facts),
    xpForHand(claim.facts),
  );
  const { level } = levelForXp(xp);

  for (const id of completed) {
    await applyWalletChange(userId, "quest", questReward(id), { ref: id }, deps);
  }
  await payLevelUps(quests, userId, before.levelPaid, level, deps);

  return { completed, duplicate, xp, level };
}

/**
 * Pays every quest the player's stored progress already marks done, and any level their XP has
 * reached but the wallet has not seen. The unique indexes make both a no-op once paid, so this
 * heals the gap between a progress commit and a crashed wallet call rather than re-paying
 * anything — safe to call on every `GET /api/quests`.
 */
export async function payCompletedQuests(userId: string, deps: RewardsDeps = {}): Promise<void> {
  const quests = deps.quests ?? databaseQuestStore;
  const rows = await quests.questProgress(userId);

  for (const row of rows) {
    if (row.completedAt === null) continue;
    await applyWalletChange(userId, "quest", questReward(row.questId), { ref: row.questId }, deps);
  }

  const progress = await quests.playerProgress(userId);
  await payLevelUps(quests, userId, progress.levelPaid, levelForXp(progress.xp).level, deps);
}
