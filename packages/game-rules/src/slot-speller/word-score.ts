/** One Slot Speller word's score (§48, Word scoring): base × length mult × Scoring powers. */

import type { Tile } from "@wordpoker/contracts";

import { tierMultiplier, type SlotSpellerConfig } from "./config";
import { hasPower, type SlotPowerCounts, type SlotPowerId } from "./powers";

/** The face one tile played: its letter and that face's printed value (0 for a blank). */
export interface PlayedFace {
  readonly tile: Tile;
  readonly letter: string;
  readonly points: number;
}

export interface SlotWordBreakdown {
  readonly base: number;
  readonly lengthMult: number;
  /** What a reader needs to check the base: multiplier tiles, choice faces, blanks. */
  readonly notes: readonly string[];
  /** The Scoring powers that multiplied this word, in rule order. */
  readonly triggered: readonly SlotPowerId[];
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

export function scoreSlotWord(
  faces: readonly PlayedFace[],
  config: SlotSpellerConfig,
  powers: SlotPowerCounts,
): SlotWordBreakdown {
  const word = faces.map((face) => face.letter).join("");
  const notes: string[] = [];
  let base = 0;

  for (const { tile, letter, points } of faces) {
    if (isBlank(tile)) {
      notes.push(`? as ${letter}`);
      continue;
    }
    if (isChoice(tile)) notes.push(`${tile.letter}/${tile.alternativeLetter} as ${letter}`);
    const factor = tile.multiplier === "triple-letter" ? 3 : tile.multiplier === "double-letter" ? 2 : 1;
    if (factor > 1) notes.push(`${factor === 3 ? "TL" : "DL"} ${letter} ${points}×${factor}`);
    base += points * factor;
  }

  let lengthMult = tierMultiplier(config.lengthMultipliers, word.length);
  if (hasPower(powers, "longHaul")) {
    lengthMult = Math.max(lengthMult, tierMultiplier(config.longHaulMultipliers, word.length));
  }

  const triggered = SCORING_POWERS.filter(([id, test]) => hasPower(powers, id) && test(word)).map(([id]) => id);
  const powerMult = config.scoringPowerMultiplier ** triggered.length;

  return { base, lengthMult, notes, triggered, score: Math.round(base * lengthMult * powerMult) };
}
