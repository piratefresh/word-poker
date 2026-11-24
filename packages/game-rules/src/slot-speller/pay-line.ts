/**
 * Paying one line (§47, Paying a line): find the best word every span of the line can spell,
 * then pick the best-scoring set of non-overlapping words.
 */

import type { Tile } from "@wordpoker/contracts";

import type { Dictionary } from "../words/dictionary";
import type { SlotSpellerConfig } from "./config";
import type { PayLine } from "./lines";
import type { SlotPowerCounts } from "./powers";
import type { SlotCell } from "./state";
import { isBlank, isChoice, scoreSlotWord, type PlayedFace, type SlotWordBreakdown } from "./word-score";

export interface SlotWord {
  readonly word: string;
  readonly line: string;
  readonly cells: readonly SlotCell[];
  /** The face letter each tile played, in order. */
  readonly faces: readonly string[];
  readonly breakdown: SlotWordBreakdown;
}

export interface PayLineContext {
  readonly dictionary: Dictionary;
  readonly config: SlotSpellerConfig;
  readonly powers: SlotPowerCounts;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Every face a tile can play. */
function facesOf(tile: Tile): PlayedFace[] {
  if (isBlank(tile)) return [...ALPHABET].map((letter) => ({ tile, letter, points: 0 }));
  const faces: PlayedFace[] = [{ tile, letter: tile.letter.toUpperCase(), points: tile.points }];
  if (isChoice(tile)) faces.push({ tile, letter: tile.alternativeLetter.toUpperCase(), points: tile.alternativePoints });
  return faces;
}

interface Candidate {
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
  readonly faces: readonly PlayedFace[];
  readonly breakdown: SlotWordBreakdown;
}

/** The best-scoring word starting at `start` for each end, found by walking prefixes. */
function candidatesFrom(start: number, options: readonly PlayedFace[][], context: PayLineContext): Map<number, Candidate> {
  const { dictionary, config, powers } = context;
  const best = new Map<number, Candidate>();
  const path: PlayedFace[] = [];

  const walk = (index: number, prefix: string, blanks: number): void => {
    if (path.length >= config.minWordLength && dictionary.isWord(prefix)) {
      const breakdown = scoreSlotWord(path, config, powers);
      const held = best.get(index);
      if (held === undefined || breakdown.score > held.breakdown.score) {
        best.set(index, { start, end: index, faces: [...path], breakdown });
      }
    }
    const faces = options[index];
    if (faces === undefined) return;
    for (const face of faces) {
      const nextBlanks = blanks + (isBlank(face.tile) ? 1 : 0);
      if (nextBlanks > config.maxBlanksPerWord) continue;
      const next = prefix + face.letter;
      if (dictionary.hasPrefix !== undefined && !dictionary.hasPrefix(next)) continue;
      path.push(face);
      walk(index + 1, next, nextBlanks);
      path.pop();
    }
  };

  walk(start, "", 0);
  return best;
}

/** The words `line` pays on `tiles` (the line's tiles, in order). */
export function payLine(tiles: readonly Tile[], line: PayLine, context: PayLineContext): SlotWord[] {
  const options = tiles.map(facesOf);
  const n = tiles.length;
  const starts = Array.from({ length: n }, (_, start) => [...candidatesFrom(start, options, context).values()]);

  // dp[i]: the best total from position i on; choice[i]: the word taken at i, or null to skip it.
  const dp = new Array<number>(n + 1).fill(0);
  const choice = new Array<Candidate | null>(n + 1).fill(null);
  for (let i = n - 1; i >= 0; i -= 1) {
    dp[i] = dp[i + 1] ?? 0;
    for (const candidate of starts[i] ?? []) {
      const total = candidate.breakdown.score + (dp[candidate.end] ?? 0);
      if (total > (dp[i] ?? 0)) {
        dp[i] = total;
        choice[i] = candidate;
      }
    }
  }

  const words: SlotWord[] = [];
  for (let i = 0; i < n; ) {
    const taken = choice[i];
    if (taken === null || taken === undefined) {
      i += 1;
      continue;
    }
    words.push({
      word: taken.faces.map((face) => face.letter).join(""),
      line: line.name,
      cells: line.cells.slice(taken.start, taken.end),
      faces: taken.faces.map((face) => face.letter),
      breakdown: taken.breakdown,
    });
    i = taken.end;
  }
  return words;
}
