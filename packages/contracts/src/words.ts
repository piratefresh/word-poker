/**
 * Words on the wire: what a seat submits, what the engine resolves it to, and the reasons a
 * submission can be refused (docs/rules/tiles.md §10–§12, docs/rules/scoring.md §7).
 *
 * A submission names **tiles, never letters**. The tiles were dealt by the authority, so a
 * play that says "the A/E tile, as E" is something both sides can check against the same
 * deck, while a play that says "E" is a client's claim about a tile nobody can see. That is
 * also why a submission carries no seat: who is acting comes from the session or the state,
 * never from the payload.
 *
 * The rule functions here are shape checks and nothing more. Whether a well-formed
 * submission is *legal* — in the dictionary, spelled from the tiles' letters, inside the
 * clock — is the engine's answer, and it arrives as a {@link WordEvaluation}.
 */

import type { DictionaryId } from "./dictionaries";
import type { LetterMultiplier } from "./tiles";

/** One physical tile as a word plays it, sitting where its letter(s) appear in the word. */
export interface TilePlay {
  /** The id of the dealt tile; the engine looks the tile up rather than trusting a letter. */
  tileId: string;
  /**
   * Which printed face a choice tile plays — `E` for A/E. Absent on tiles with only one way
   * to play: a single letter plays itself, and a sequence tile always plays both faces in
   * the printed order.
   */
  chosenFace?: string;
}

/**
 * A word as a seat submits it: the tiles in word order, where one sequence tile covers the
 * two letters it prints. `plays: []` is well formed — an empty submission is a word the
 * engine gets to refuse, not a payload it gets to throw away.
 */
export interface WordSubmission {
  readonly plays: readonly TilePlay[];
}

/** Whether one untrusted entry of `plays` has the shape of a tile play. */
function isTilePlay(value: unknown): value is TilePlay {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("tileId" in value) || typeof value.tileId !== "string" || value.tileId.length === 0) {
    return false;
  }
  if ("chosenFace" in value && value.chosenFace !== undefined && typeof value.chosenFace !== "string") {
    return false;
  }
  return true;
}

/**
 * Whether an untrusted value is a structurally valid submission — what a socket handler
 * checks before the payload reaches the engine, and all it needs to check.
 */
export function isWordSubmission(value: unknown): value is WordSubmission {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("plays" in value) || !Array.isArray(value.plays)) {
    return false;
  }
  return value.plays.every(isTilePlay);
}

/**
 * Every way a submission can be refused, from §11's list of invalid submissions.
 *
 * A string union rather than numbers, because these cross the wire and end up in logs and
 * UI copy: `not-in-dictionary` says what happened, and reordering the list can never
 * renumber a reason a client already understands.
 */
export const WORD_REJECTION_REASONS = [
  /** Nothing was played — no tiles at all. */
  "empty-submission",
  /** Fewer than the two letters of §12. */
  "too-short",
  /** More letters than the tiles on the table can spell. */
  "too-long",
  /** A played tile is not one this seat holds, or is asked for a face it does not print. */
  "uses-unavailable-letters",
  /** The same physical tile was played twice. */
  "tile-reused",
  /** A two-letter tile was split — one of its letters left out. */
  "two-letter-split",
  /** A sequence tile was played backwards or out of order. */
  "sequence-reversed",
  /** Not in the configured list (§11). */
  "not-in-dictionary",
  /** Submitted after the reveal timer expired. */
  "timer-expired",
] as const;

/** Why a submission was refused. */
export type WordRejectionReason = (typeof WORD_REJECTION_REASONS)[number];

/** One letter a played tile contributes, with the value printed beside it (§6). */
export interface TileLetter {
  readonly letter: string;
  readonly points: number;
}

/** What one played tile resolved to, once the engine accepted the play. */
export interface TilePlayResolution {
  readonly tileId: string;
  /**
   * The letters this tile contributes, in word order: one, or both of a sequence tile,
   * each with its own printed value. A sequence tile's two faces need not be worth the
   * same, and scoring adds them letter by letter (§6, §7).
   */
  readonly letters: readonly TileLetter[];
  /** The tile's printed multiplier, when it has one (§7, §9). */
  readonly multiplier?: LetterMultiplier;
}

/** One letter's contribution to a word's score (docs/rules/scoring.md §7). */
export interface WordLetterScore {
  readonly letter: string;
  /** The letter's printed value before any multiplier (§6). */
  readonly baseValue: number;
  /** The multiplier this letter's tile applied, when it has one (§7.2, §9); never stacked. */
  readonly multiplier?: LetterMultiplier;
  /** What the letter adds: `baseValue`, doubled or tripled when a multiplier applies. */
  readonly value: number;
}

/**
 * A word's score (docs/rules/scoring.md §7): `total = letterScore + fullRackBonus`.
 *
 * The breakdown is per letter and in word order, so it lines up with the evaluation's
 * `tiles` flattened: those already resolve each letter to the physical tile that printed
 * it, and one copy of that is enough for the UI, the server, and the scoring step to agree
 * on. What the letters do not carry — the rack bonus, and the totals — is what is here.
 */
export interface WordScore {
  /** Every letter of the word, with its multiplier already applied to its value. */
  readonly letters: readonly WordLetterScore[];
  /** §7 steps 1–2: the letters' values after any tile multipliers, before the rack bonus. */
  readonly letterScore: number;
  /** §7 step 3: `+10` when all seven physical tiles were used; never multiplied. */
  readonly fullRackBonus: number;
  /** What the hand is ranked by. */
  readonly total: number;
}

/** What the engine made of one submission. */
export type WordEvaluation =
  | {
      readonly valid: true;
      /** The word as resolved from the played tiles, uppercase. */
      readonly word: string;
      /** The list it was checked against, so a result cannot be read against another (§11). */
      readonly dictionary: DictionaryId;
      /** The played tiles in word order, each with the letter(s) it contributed. */
      readonly tiles: readonly TilePlayResolution[];
      /** §7 breakdown; present once the scoring step has run on this evaluation. */
      readonly score?: WordScore;
    }
  | {
      readonly valid: false;
      readonly reason: WordRejectionReason;
    };
