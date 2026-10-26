/**
 * challenges.ts — Chapter 1 "Kitchen Table" lessons, as data (STO-860 prototype).
 *
 * A challenge is an authored hand (`fixedDeal`) at a table of the offline cast, a goal, and the
 * word scores its stars sit at. The table is the ordinary offline one — heuristic bots, the real
 * engine — so a challenge is played through `challengeSession`, the same `OfflineSession` seam
 * the tutorial uses. Progress keys on `id@version`, so a re-authored deal bumps `version`.
 */

import type { RoundPhase } from "@wordpoker/contracts";
import {
  DEFAULT_STAKES,
  fixedDeal,
  reduce,
  startHand,
  type Dictionary,
  type FixedDealSpec,
} from "@wordpoker/game-rules";

import { randomSeed } from "@/features/offline/offline-seed";
import { nextCpuMove, type OfflineSession } from "@/features/offline/use-offline-game";

export interface Challenge {
  id: string;
  version: number;
  title: string;
  /** Seat ids in table order; the offline adapter names seats by index, hero first. */
  players: readonly string[];
  deal: FixedDealSpec;
  goal: string;
  /** The hero's word score that earns one, two and three stars. */
  stars: readonly [number, number, number];
  coach: Partial<Record<RoundPhase, string>>;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: "first-hand",
    version: 1,
    title: "First Hand",
    players: ["hero", "ellis"],
    // No seven-letter word here: the Full Rack Bonus is Word Wizard's lesson.
    deal: { hands: { 0: ["B", "O"] }, board: ["A", "T", "S", "K", "N"] },
    goal: "Spell a word from your two tiles and the board.",
    stars: [1, 10, 14],
    coach: {
      preflop: "B and O are yours alone. Call to see the board.",
      flop: "Three tiles are shared. Can you see BOAT?",
      turn: "Another tile. Longer words score more.",
      river: "All five are out. Build your best word before the clock runs down.",
      payout: "The best word takes the pot.",
    },
  },
  {
    id: "word-wizard",
    version: 1,
    title: "Word Wizard",
    players: ["hero", "ellis", "jay"],
    deal: { hands: { 0: ["P", "L"] }, board: ["A", "N", "E:2", "T", "TS"] },
    goal: "Use all seven tiles for the Full Rack Bonus.",
    stars: [8, 13, 25],
    coach: {
      preflop: "Seven tiles in one word earns +10. Keep that in mind.",
      flop: "The E is a Double Letter: it counts twice.",
      turn: "That T/S tile is a choice tile. Tap it to pick a face.",
      river: "P, L and all five on the board. There's a seven-letter word in here.",
      payout: "Every tile used: that's the Full Rack Bonus.",
    },
  },
];

export function challengeById(id: string | undefined): Challenge | undefined {
  return CHALLENGES.find((challenge) => challenge.id === id);
}

/** Stars a word score earns: 0–3. */
export function starsFor(challenge: Challenge, score: number): number {
  return challenge.stars.filter((threshold) => score >= threshold).length;
}

/** The offline table, dealt from the challenge's spec; unnamed seats come from a fresh seed. */
export function challengeSession(challenge: Challenge, dictionary: Dictionary): OfflineSession {
  return {
    now: Date.now,
    held: false,
    open: (nowMs) => {
      const seed = randomSeed();
      const players = [...challenge.players];
      const deal = fixedDeal({ seed, playerCount: players.length, spec: challenge.deal });
      return startHand({ seed, players, nowMs, dictionary, stakes: DEFAULT_STAKES, deal });
    },
    reduce,
    nextMove: nextCpuMove,
  };
}
