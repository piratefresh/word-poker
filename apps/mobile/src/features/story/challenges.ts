/**
 * challenges.ts — Chapter 1 "Kitchen Table" lessons, as data (STO-860 prototype).
 *
 * A challenge is an authored hand (`fixedDeal`) at a table of the offline cast and a goal; the
 * stars it earns are the chapter run's (`STORY_CHAPTERS` in game-rules). The table is the ordinary
 * offline one — heuristic bots, the real engine — so every map node is played through
 * `storySession`, the same `OfflineSession` seam the tutorial uses. `version` bumps with a
 * re-authored deal.
 */

import type { PowerUpId, RoundPhase } from "@wordpoker/contracts";
import {
  DEFAULT_STAKES,
  fixedDeal,
  reduce,
  startHand,
  type Dictionary,
  type FixedDealSpec,
} from "@wordpoker/game-rules";

import { randomSeed } from "@/features/offline/offline-seed";
import type { MapNode } from "@/features/story/kitchen-table-map";
import { nextCpuMove, type OfflineSession } from "@/features/offline/use-offline-game";

export interface Challenge {
  id: string;
  version: number;
  title: string;
  /** Seat ids in table order; the offline adapter names seats by index, hero first. */
  players: readonly string[];
  deal: FixedDealSpec;
  goal: string;
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

/** What a map node deals: its seats, and the authored hand where it has one. */
export interface StoryTable {
  players: readonly string[];
  deal?: FixedDealSpec;
}

/**
 * The offline table for one story hand. A seat holding drafted powers opens the hand on a Power
 * Draw of exactly those, and keeps one for the hand; with none drafted the hand is Classic.
 */
export function storySession(
  table: StoryTable,
  dictionary: Dictionary,
  powers: readonly PowerUpId[] = [],
): OfflineSession {
  return {
    now: Date.now,
    held: false,
    open: (nowMs) => {
      const seed = randomSeed();
      const players = [...table.players];
      const deal = table.deal === undefined ? undefined : fixedDeal({ seed, playerCount: players.length, spec: table.deal });
      return startHand({
        seed,
        players,
        nowMs,
        dictionary,
        stakes: DEFAULT_STAKES,
        ...(deal === undefined ? {} : { deal }),
        ...(powers.length === 0 ? {} : { powerUps: { deal: "choose3", offers: { [players[0]!]: powers } } }),
      });
    },
    reduce,
    nextMove: nextCpuMove,
  };
}

/** Who sits at a map node, and the authored hand where it has one. */
export function storyTable(node: MapNode): StoryTable {
  const challenge = challengeById(node.challengeId);
  if (challenge !== undefined) return { players: challenge.players, deal: challenge.deal };
  // The Professor's own play style and tell are STO-974; until then he is the heuristic bot.
  if (node.kind === "boss") return { players: ["hero", "professor"] };
  return { players: ["hero", node.friend?.id ?? "mira"] };
}
