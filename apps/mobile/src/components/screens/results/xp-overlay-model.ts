/**
 * xp-overlay-model.ts — the numbers and words of the non-winner XP overlay (STO-573).
 *
 * Pure, so the overlay draws what it is handed: the reward a hand is worth comes from
 * `game-rules`' `xpForHand` (never re-priced here), and where it lands on the level curve from
 * `levelForXp`. Predicted XP is only ever shown — the server's total replaces it on acknowledgement.
 */

import { XP_PER_HAND, levelForXp } from "@wordpoker/game-rules";

import type { ClaimOutcome, HandReport } from "@/lib/quests/quests-provider";

import type { ResultsSeat } from "./results-types";

/** One frame of the bar: the level it is filling and how full it is, 0–100. */
export interface XpStep {
  readonly level: number;
  readonly progress: number;
}

/** "1ST PLACE", "2ND PLACE", "11TH PLACE" — the pill's printed label. */
export function placementLabel(place: number): string {
  const teen = place % 100 >= 11 && place % 100 <= 13;
  const suffix = teen ? "TH" : ({ 1: "ST", 2: "ND", 3: "RD" } as Record<number, string>)[place % 10] ?? "TH";

  return `${place}${suffix} PLACE`;
}

/** The two rows of the breakdown: playing the hand, and the word it spelled (0 when it spelled none). */
export function xpBreakdown(hero: ResultsSeat): { participation: number; word: number; total: number } {
  return { participation: XP_PER_HAND, word: hero.total, total: XP_PER_HAND + hero.total };
}

function standing(xp: number): XpStep {
  const { level, intoLevel, toNext } = levelForXp(xp);

  return { level, progress: (intoLevel / (intoLevel + toNext)) * 100 };
}

/**
 * The bar's journey from one XP total to another: a full bar for every level crossed, then the
 * final fill. A hand that crosses nothing is one step. `steps[0]` is where the bar starts.
 */
export function xpSteps(fromXp: number, toXp: number): XpStep[] {
  const start = standing(fromXp);
  const end = standing(toXp);
  const steps: XpStep[] = [start];
  for (let level = start.level; level < end.level; level += 1) {
    steps.push({ level, progress: 100 }, { level: level + 1, progress: 0 });
  }
  steps.push(end);

  return steps;
}

export type XpSync = "signed-out" | "pending" | "confirmed" | "rejected";

/** What the overlay says about the account: a sync state, and the XP totals if they are known. */
export interface XpView {
  readonly sync: XpSync;
  /** Where the bar starts, or `null` while the account's XP has not loaded. */
  readonly fromXp: number | null;
  /** Where it ends: the server's total once confirmed, else the prediction. */
  readonly toXp: number | null;
}

/**
 * Reconciles the frozen report, the predicted reward and the claim's own outcome. Only the
 * outcome filed under this report's token counts — any other claim's answer is none of its business.
 */
export function xpView(
  report: HandReport | null,
  reward: number,
  outcomes: Readonly<Record<string, ClaimOutcome>>,
): XpView {
  if (report === null) return { sync: "signed-out", fromXp: null, toXp: null };

  const outcome = outcomes[report.handToken];
  if (outcome?.status === "confirmed") {
    return { sync: "confirmed", fromXp: report.baselineXp ?? outcome.xp - reward, toXp: outcome.xp };
  }
  const { baselineXp } = report;
  const predicted = baselineXp === null ? null : baselineXp + reward;
  if (outcome?.status === "rejected") return { sync: "rejected", fromXp: baselineXp, toXp: baselineXp };

  return { sync: "pending", fromXp: baselineXp, toXp: predicted };
}
