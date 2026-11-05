/**
 * boss.ts — story mode's five bosses (STO-974, `docs/rules/story-mode.md` §46): a play style on
 * top of the heuristic bot and one tell the felt shows. Bosses hold no powers. The boss's betting
 * and word still see only its `BotObservation`; a tell reads the boss's own tiles and the public
 * table, which is exactly what makes it a tell.
 */

import type { PlayerId, Tile } from "@wordpoker/contracts";

import { createRng } from "../core/rng";
import type { OfflineState } from "../table/offline";
import { observeBot, type BotObservation } from "./bot-observation";
import type { BotProfile } from "./bot-profile";
import { assessBotStrength, type BotStrength } from "./bot-strength";
import { topWords, type BotWord, type ChooseWordOptions } from "./bot-word";

/** A boss is named by its chapter's boss node id. */
export const BOSS_IDS = ["professor", "vowel-vinny", "hustler", "lady-q", "dealer"] as const;
export type BossId = (typeof BOSS_IDS)[number];
/** The four play styles; The Dealer plays one of them each hand. */
export type BossStyle = Exclude<BossId, "dealer">;
export type TellKind = "pressure" | "vowel-jar" | "chip-stack" | "glint";

const STYLES: readonly BossStyle[] = ["professor", "vowel-vinny", "hustler", "lady-q"];

export const BOSS_TELL: Readonly<Record<BossStyle, TellKind>> = {
  professor: "pressure",
  "vowel-vinny": "vowel-jar",
  hustler: "chip-stack",
  "lady-q": "glint",
};

const BOSS_PROFILES: Readonly<Record<BossStyle, BotProfile>> = {
  professor: { name: "professor", aggression: 0.6, bluff: 0.05, slowPlay: 0.15, curiosity: 1, sizing: 0.9 },
  // Plays safe: rarely raises, small bets, lets marginal hands go.
  "vowel-vinny": { name: "vowel-vinny", aggression: 0.4, bluff: 0.02, slowPlay: 0.1, curiosity: 0.75, sizing: 0.7 },
  hustler: { name: "hustler", aggression: 1, bluff: 0.45, slowPlay: 0, curiosity: 1.3, sizing: 1.2 },
  "lady-q": { name: "lady-q", aggression: 0.7, bluff: 0.12, slowPlay: 0.2, curiosity: 1, sizing: 1.1 },
};

/** The Professor's bar: one step per doubling of the most an opponent has put in, full at 16 big blinds. */
export const PRESSURE_FULL = 4;
const DEALER_SALT = 0x0dea1e5;
const VOWELS = "AEIOU";
const RARE = "QZJX";

export function isBossId(id: string): id is BossId {
  return (BOSS_IDS as readonly string[]).includes(id);
}

/** The style a boss plays this hand: its own, or for The Dealer one drawn from the hand's seed. */
export function bossStyle(boss: BossId, handSeed: number): BossStyle {
  if (boss !== "dealer") return boss;
  return STYLES[Math.floor(createRng(handSeed ^ DEALER_SALT)() * STYLES.length)] ?? "professor";
}

function faces(tile: Tile): string[] {
  return "alternativeLetter" in tile ? [tile.letter, tile.alternativeLetter] : [tile.letter];
}

function holds(tiles: readonly Tile[], letters: string): number {
  return tiles.filter((tile) => faces(tile).some((face) => letters.includes(face))).length;
}

/** The profile a boss bets with: Lady Q leans in while she holds a rare tile. */
export function bossProfile(style: BossStyle, view: BotObservation): BotProfile {
  const profile = BOSS_PROFILES[style];
  if (style !== "lady-q" || holds(view.privateTiles, RARE) === 0) return profile;
  return { ...profile, aggression: 1, curiosity: 1.4, sizing: 1.3 };
}

/** The bar over The Professor: how hard the table has pushed him this hand. */
export function bossPressure(view: Pick<BotObservation, "seat" | "seats" | "bigBlind">): number {
  const pushed = Math.max(0, ...view.seats
    .filter((seat, index) => index !== view.seat && !seat.sittingOut)
    .map((seat) => seat.committedHand));
  const steps = Math.floor(Math.log2(Math.max(1, pushed / view.bigBlind)));
  return Math.min(PRESSURE_FULL, steps);
}

/**
 * A style's bend on the betting policy's answer: The Hustler opens every hand with a raise, and
 * The Professor never folds until his bar is full — then he folds anything short of strong.
 */
export function bossBetBend(
  style: BossStyle,
  view: BotObservation,
  strength: BotStrength,
): { readonly raise: boolean; readonly fold: "never" | "always" | "default" } {
  const actor = view.seats[view.seat];
  const raise = style === "hustler" && view.phase === "preflop" && actor?.actedThisRound === false;
  if (style !== "professor") return { raise, fold: "default" };
  const strong = strength.tier === "strong" || strength.tier === "premium";
  return { raise, fold: bossPressure(view) < PRESSURE_FULL ? "never" : strong ? "default" : "always" };
}

const WORD_KEYS: Readonly<Record<BossStyle, (word: BotWord) => number>> = {
  professor: (word) => word.word.length,
  "vowel-vinny": (word) => [...word.word].filter((letter) => VOWELS.includes(letter)).length,
  hustler: () => 0,
  "lady-q": (word) => [...word.word].filter((letter) => RARE.includes(letter)).length,
};

/** The boss's word: the best-scoring one among those its style likes most. */
export function bossWord(options: ChooseWordOptions, style: BossStyle): BotWord | null {
  const key = WORD_KEYS[style];
  // `topWords` is best-score first and the sort is stable, so ties on the style keep the score order.
  return topWords(options, 40).sort((a, b) => key(b) - key(a))[0] ?? null;
}

/** What the felt shows over a boss: its tell's kind and how full it is, `level` of `max`. */
export interface BossTell {
  readonly playerId: PlayerId;
  readonly boss: BossId;
  readonly style: BossStyle;
  readonly kind: TellKind;
  readonly level: number;
  readonly max: number;
}

const MESS: Readonly<Record<BotStrength["tier"], number>> = { premium: 0, strong: 1, playable: 2, weak: 3 };

/** Every boss seat's tell at this moment of the hand; empty at a table with no bosses. */
export function bossTells(state: OfflineState): BossTell[] {
  const bosses = state.bosses;
  if (bosses === undefined) return [];
  return state.seats.flatMap((seat, index): BossTell[] => {
    const boss = bosses[seat.id];
    if (boss === undefined || seat.sittingOut) return [];
    const style = bossStyle(boss, state.seed);
    const kind = BOSS_TELL[style];
    const view = observeBot(state, index, state.betting ?? { currentBet: 0, lastRaiseSize: 0 });
    const reading = kind === "pressure" ? { level: bossPressure(view), max: PRESSURE_FULL }
      : kind === "vowel-jar" ? { level: holds(view.privateTiles, VOWELS), max: view.privateTiles.length }
      : kind === "glint" ? { level: Math.min(1, holds(view.privateTiles, RARE)), max: 1 }
      : { level: MESS[assessBotStrength(view).tier], max: 3 };
    return [{ playerId: seat.id, boss, style, kind, ...reading }];
  });
}
