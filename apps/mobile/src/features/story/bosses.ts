/**
 * bosses.ts — what the coach says about each boss's tell (STO-974). The play styles and the tells
 * themselves are game-rules' `boss.ts`; this is only the words.
 */

import type { BossId, BossStyle } from "@wordpoker/game-rules";

export const BOSS_COPY: Readonly<Record<BossStyle, { name: string; coach: string; hint: string }>> = {
  professor: {
    name: "The Professor",
    coach: "Watch the bar over Uncle Prof. Every raise fills it.",
    hint: "He folds when the bar’s full. Push him.",
  },
  "vowel-vinny": {
    name: "Vowel Vinny",
    coach: "Vinny’s jar shows how many vowels he’s hoarding.",
    hint: "An empty jar means a dry hand. Bet into it.",
  },
  hustler: {
    name: "The Hustler",
    coach: "He raises every hand. Watch his chip stack, not his bets.",
    hint: "A messy stack is a weak hand. Call him down.",
  },
  "lady-q": {
    name: "Lady Q",
    coach: "Her tiles glint when she’s holding a Q, Z, J or X.",
    hint: "No glint, no big word. That’s your moment.",
  },
};

/** The Dealer borrows another boss's tell each hand, so the coach names whose it is. */
export function bossCoachLine(style: BossStyle, isDealer: boolean): string {
  const copy = BOSS_COPY[style];
  return isDealer ? `The Dealer is playing like ${copy.name} this hand. ${copy.coach}` : copy.coach;
}

export function bossName(boss: BossId): string {
  return boss === "dealer" ? "The Dealer" : BOSS_COPY[boss].name;
}
