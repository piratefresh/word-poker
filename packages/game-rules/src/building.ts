/**
 * Word building: is this word legally buildable from these tiles (docs/rules/tiles.md
 * §10–§12)?
 *
 * The submission names *tiles*, and every letter in the word comes from a face the tile
 * actually prints — so the payload cannot smuggle in a letter the table never dealt. The
 * caller supplies the tiles the seat may play (its private tiles plus the community board)
 * and the configured dictionary; everything else is decided here, from those two arguments
 * and nothing else. No clock: the deadline is the reducer's business (STO-324).
 *
 * Refusals carry §11's reasons. Only `timer-expired` is deliberately not produced here: it
 * belongs to the caller's clock. §12's ceiling is checked here beside its floor, so a caller
 * that hands over more tiles than a table deals — a test, a replay, a future mode — gets the
 * word refused by name rather than accepted for being buildable.
 */

import type {
  Tile,
  TilePlay,
  TilePlayResolution,
  WordEvaluation,
  WordRejectionReason,
  WordSubmission,
} from "@wordpoker/contracts";

import type { Dictionary } from "./dictionary";

/** What a submission is checked against: the tiles in play, and the words that count. */
export interface EvaluateWordOptions extends ResolveSubmissionOptions {
  /** The configured word list (§11); its id is reported back in the result. */
  readonly dictionary: Dictionary;
}

/** How one played tile resolves, or why it cannot be played at all. */
type Resolution =
  | { readonly ok: true; readonly play: TilePlayResolution }
  | { readonly ok: false; readonly reason: WordRejectionReason };

/** §12: a word is at least two letters. */
const MIN_WORD_LETTERS = 2;

/** §12: and at most seven — every tile, choice tiles included, plays exactly one letter. */
const MAX_WORD_LETTERS = 7;

/**
 * What a play's named face gives, checked against the faces the tile prints.
 *
 * A single letter has nothing to name and plays itself; a choice tile must name the face it
 * plays (`E` for A/E) and may name only that — the letter it does not play is not used, not
 * scored, and counts toward nothing (§10).
 */
function resolvePlay(tile: Tile, play: TilePlay): Resolution {
  const face = play.chosenFace;

  if ("alternativeLetter" in tile) {
    if (face !== tile.letter && face !== tile.alternativeLetter) {
      // Covers a missing face, a letter the tile does not print, and `A` and `E` asked
      // for at once — §10: a choice tile provides one face, never both.
      return { ok: false, reason: "uses-unavailable-letters" };
    }
    const points = face === tile.alternativeLetter ? tile.alternativePoints : tile.points;
    return {
      ok: true,
      play: {
        tileId: tile.id,
        letters: [{ letter: face, points }],
        ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
      },
    };
  }

  if (face !== undefined && face !== tile.letter) {
    return { ok: false, reason: "uses-unavailable-letters" };
  }
  return {
    ok: true,
    play: {
      tileId: tile.id,
      letters: [{ letter: tile.letter, points: tile.points }],
      ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
    },
  };
}

/** What a submission resolves to, before any word list is consulted. */
export type SubmissionResolution =
  | {
      readonly ok: true;
      /** The word the played tiles spell, in submission order. */
      readonly word: string;
      /** The played tiles in word order, each with the letter(s) it contributed. */
      readonly tiles: readonly TilePlayResolution[];
    }
  | { readonly ok: false; readonly reason: WordRejectionReason };

/** What a submission is resolved against when there is no word list to consult. */
export interface ResolveSubmissionOptions {
  /**
   * Every physical tile the seat may play — its private tiles plus the community board.
   * Tiles outside this list are not merely unknown, they are unplayable.
   */
  readonly available: readonly Tile[];
  /** The seat's word, as submitted. */
  readonly submission: WordSubmission;
}

/**
 * The letters a submission spells, tile by tile, before §12's floor and §11's list are
 * applied.
 *
 * This is what a seat has *typed*: a draft of one tile has a letter, even though no word of
 * one letter can stand. The word window and the felt's word builder both show it, so the
 * seat sees the letters it has played while `resolveSubmission` still refuses to call it a
 * word. A play naming a tile that is not held, or a face the tile does not print, contributes
 * nothing here rather than throwing: it is display, and the refusal is the caller's to read
 * off `resolveSubmission`.
 *
 * @param options The seat's tiles and the submission to spell.
 */
export function spellSubmission({ available, submission }: ResolveSubmissionOptions): string {
  let word = "";

  for (const play of submission.plays) {
    const tile = available.find((candidate) => candidate.id === play.tileId);
    if (tile === undefined) {
      continue;
    }

    const resolution = resolvePlay(tile, play);
    if (!resolution.ok) {
      continue;
    }

    for (const letter of resolution.play.letters) {
      word += letter.letter;
    }
  }

  return word;
}

/**
 * Resolves a submission against the tiles in play: the word the plays spell, the tile behind
 * every letter, or the §10–§12 reason it cannot be built at all.
 *
 * This is the half of evaluation that needs no word list, and it is where the whole of §10's
 * face and order rules live. The word window (offline.ts) refuses an unbuildable submission
 * with these reasons while the seat still has time to fix it; `evaluateWord` adds §11's list
 * check on top for the showdown, so the two can never disagree about what is buildable.
 *
 * The plays are resolved in submission order, which is the word's order, and every play puts
 * exactly one letter where it sits — the face a choice tile names, or the letter a plain tile
 * prints (§10). A play naming a tile that is not in `available`, or the same tile twice, is
 * refused before anything is spelled — a word built on a tile the seat does not hold is not a
 * word, whatever the dictionary says about the letters.
 */
export function resolveSubmission({
  available,
  submission,
}: ResolveSubmissionOptions): SubmissionResolution {
  if (submission.plays.length === 0) {
    return { ok: false, reason: "empty-submission" };
  }

  const tiles: TilePlayResolution[] = [];
  const played = new Set<string>();
  let word = "";

  for (const play of submission.plays) {
    if (played.has(play.tileId)) {
      return { ok: false, reason: "tile-reused" };
    }
    // Seven tiles at most in a hand, so the lookup is a scan rather than a Map that would
    // be rebuilt on every submission.
    const tile = available.find((candidate) => candidate.id === play.tileId);
    if (tile === undefined) {
      return { ok: false, reason: "uses-unavailable-letters" };
    }

    const resolution = resolvePlay(tile, play);
    if (!resolution.ok) {
      return { ok: false, reason: resolution.reason };
    }

    played.add(play.tileId);
    tiles.push(resolution.play);
    for (const letter of resolution.play.letters) {
      word += letter.letter;
    }
  }

  if (word.length < MIN_WORD_LETTERS) {
    return { ok: false, reason: "too-short" };
  }
  if (word.length > MAX_WORD_LETTERS) {
    return { ok: false, reason: "too-long" };
  }

  return { ok: true, word, tiles };
}

/**
 * Evaluates one submission: the word it spells, the tile behind every letter, or the §11
 * reason it was refused.
 *
 * §10–§12 are {@link resolveSubmission}'s; what is left here is §11's list check, so a
 * submission cannot be buildable in one place and not in the other.
 *
 * @param options The seat's tiles, the submission, and the configured dictionary.
 */
export function evaluateWord({ available, submission, dictionary }: EvaluateWordOptions): WordEvaluation {
  const resolution = resolveSubmission({ available, submission });
  if (!resolution.ok) {
    return { valid: false, reason: resolution.reason };
  }

  if (!dictionary.isWord(resolution.word)) {
    return { valid: false, reason: "not-in-dictionary" };
  }

  return { valid: true, word: resolution.word, dictionary: dictionary.id, tiles: resolution.tiles };
}
