/** One Slot Speller word's score (§48, Word score): base × word cells × length mult × Scoring powers. */

import type { Tile } from "@wordpoker/contracts";

import type { SlotPremiumCell } from "./cells";
import { tierMultiplier, type SlotSpellerConfig } from "./config";
import { hasPower, type SlotPowerCounts, type SlotPowerId } from "./powers";

/** The face one tile played: its letter and that face's printed value (0 for a blank). */
export interface PlayedFace {
  readonly tile: Tile;
  readonly letter: string;
  readonly points: number;
}

/** One letter of a word's working: `points × tileMult × cellMult` joins the base. */
export interface SlotLetterScore {
  readonly letter: string;
  /** The played face's printed value; 0 for a blank. */
  readonly points: number;
  /** 2 or 3 on a Double or Triple Letter tile, else 1. */
  readonly tileMult: number;
  /** The letter cell under the tile, else 1. */
  readonly cellMult: number;
}

/** Everything needed to print a word's working, e.g. `C4 + A1×3L + T2 = 9 · ×2W · ×½ length = 9`. */
export interface SlotWordBreakdown {
  /** The word's letters in order. */
  readonly letters: readonly SlotLetterScore[];
  readonly base: number;
  /** The multiplier of each word cell the word covers, left to right. */
  readonly wordCells: readonly number[];
  readonly lengthMult: number;
  /** What a reader needs to check the base: multiplier tiles, choice faces, blanks. */
  readonly notes: readonly string[];
  /** The Scoring powers that multiplied this word, in rule order. */
  readonly triggered: readonly SlotPowerId[];
  /** The score before rounding; it differs from `score` only when a half was rounded. */
  readonly exact: number;
  readonly score: number;
}

export function isBlank(tile: Tile): boolean {
  return "blank" in tile && tile.blank;
}

export function isChoice(tile: Tile): tile is Tile & { alternativeLetter: string; alternativePoints: number } {
  return "alternativeLetter" in tile;
}

/** The Scoring powers in the order they apply, each with the test a word must pass. */
const SCORING_POWERS: readonly (readonly [SlotPowerId, (word: string) => boolean])[] = [
  ["action", (word) => word.endsWith("ING") || word.endsWith("ED")],
  ["heavy", (word) => /[JQXZ]/.test(word)],
  ["twins", (word) => /(.)\1/.test(word)],
];

/**
 * Scores the word `faces` spell. `premiums[i]` is the premium cell under `faces[i]`, when the
 * line counts cells: a letter cell multiplies its tile, a word cell the whole word (a blank on
 * one still counts), and cells apply before the length multiplier and the powers.
 */
export function scoreSlotWord(
  faces: readonly PlayedFace[],
  config: SlotSpellerConfig,
  powers: SlotPowerCounts,
  premiums: readonly (SlotPremiumCell | undefined)[] = [],
): SlotWordBreakdown {
  const word = faces.map((face) => face.letter).join("");
  const notes: string[] = [];
  const letters: SlotLetterScore[] = [];
  const wordCells: number[] = [];
  let base = 0;

  faces.forEach(({ tile, letter, points }, index) => {
    const premium = premiums[index];
    if (premium?.kind === "word") wordCells.push(premium.multiplier);
    const cellMult = premium?.kind === "letter" ? premium.multiplier : 1;
    if (isBlank(tile)) {
      notes.push(`? as ${letter}`);
      letters.push({ letter, points: 0, tileMult: 1, cellMult });
      return;
    }
    if (isChoice(tile)) notes.push(`${tile.letter}/${tile.alternativeLetter} as ${letter}`);
    const tileMult = tile.multiplier === "triple-letter" ? 3 : tile.multiplier === "double-letter" ? 2 : 1;
    if (tileMult > 1) notes.push(`${tileMult === 3 ? "TL" : "DL"} ${letter} ${points}×${tileMult}`);
    letters.push({ letter, points, tileMult, cellMult });
    base += points * tileMult * cellMult;
  });

  let lengthMult = tierMultiplier(config.lengthMultipliers, word.length);
  if (hasPower(powers, "longHaul")) {
    lengthMult = Math.max(lengthMult, tierMultiplier(config.longHaulMultipliers, word.length));
  }

  const triggered = SCORING_POWERS.filter(([id, test]) => hasPower(powers, id) && test(word)).map(([id]) => id);
  const powerMult = config.scoringPowerMultiplier ** triggered.length;

  const exact = wordCells.reduce((total, multiplier) => total * multiplier, base) * lengthMult * powerMult;

  return { letters, base, wordCells, lengthMult, notes, triggered, exact, score: Math.round(exact) };
}
