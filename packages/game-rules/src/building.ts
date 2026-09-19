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
 * Refusals carry §11's reasons. Two are deliberately not produced here, and the split is
 * the honest one rather than a branch that cannot fire: `timer-expired` belongs to the
 * caller's clock, and §12's upper bound is structural — a submission can play neither more
 * tiles nor more letters than `available` holds, since every play must name a distinct tile
 * from that set.
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
export interface EvaluateWordOptions {
  /**
   * Every physical tile the seat may play — its private tiles plus the community board.
   * Tiles outside this list are not merely unknown, they are unplayable.
   */
  readonly available: readonly Tile[];
  /** The seat's word, as submitted. */
  readonly submission: WordSubmission;
  /** The configured word list (§11); its id is reported back in the result. */
  readonly dictionary: Dictionary;
}

/** How one played tile resolves, or why it cannot be played at all. */
type Resolution =
  | { readonly ok: true; readonly play: TilePlayResolution }
  | { readonly ok: false; readonly reason: WordRejectionReason };

/** §12: a word is at least two letters. */
const MIN_WORD_LETTERS = 2;

/**
 * What a play's named face gives, checked against the faces the tile prints.
 *
 * A play may name a face for any tile, and naming one is how a client says what it thinks
 * it is playing: a choice tile must name the face it plays (`E` for A/E), and a sequence
 * tile may name its first letter or the printed pair but nothing that would take one letter
 * out of the pair or turn it around (§10).
 */
function resolvePlay(tile: Tile, play: TilePlay): Resolution {
  const face = play.chosenFace;

  if ("sequenceLetter" in tile) {
    const printed = `${tile.letter}${tile.sequenceLetter}`;
    if (face === undefined || face === tile.letter || face === printed) {
      return {
        ok: true,
        play: {
          tileId: tile.id,
          letters: [tile.letter, tile.sequenceLetter],
          points: tile.points + tile.sequencePoints,
          ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
        },
      };
    }
    // The second face on its own is a split attempt; the pair backwards is a reversal.
    if (face === tile.sequenceLetter || face === tile.sequenceLetter + tile.letter) {
      return { ok: false, reason: face === tile.sequenceLetter ? "two-letter-split" : "sequence-reversed" };
    }
    return { ok: false, reason: "uses-unavailable-letters" };
  }

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
        letters: [face],
        points,
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
      letters: [tile.letter],
      points: tile.points,
      ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
    },
  };
}

/**
 * Evaluates one submission: the word it spells, the tile behind every letter, or the §11
 * reason it was refused.
 *
 * The plays are resolved in submission order, which is the word's order, and a sequence
 * tile puts both of its letters where it sits. A play naming a tile that is not in
 * `available`, or the same tile twice, is refused before anything is spelled — a word built
 * on a tile the seat does not hold is not a word, whatever the dictionary says about the
 * letters.
 *
 * @param options The seat's tiles, the submission, and the configured dictionary.
 */
export function evaluateWord({ available, submission, dictionary }: EvaluateWordOptions): WordEvaluation {
  if (submission.plays.length === 0) {
    return { valid: false, reason: "empty-submission" };
  }

  const tiles: TilePlayResolution[] = [];
  const played = new Set<string>();
  let word = "";

  for (const play of submission.plays) {
    if (played.has(play.tileId)) {
      return { valid: false, reason: "tile-reused" };
    }
    // Seven tiles at most in a hand, so the lookup is a scan rather than a Map that would
    // be rebuilt on every submission.
    const tile = available.find((candidate) => candidate.id === play.tileId);
    if (tile === undefined) {
      return { valid: false, reason: "uses-unavailable-letters" };
    }

    const resolution = resolvePlay(tile, play);
    if (!resolution.ok) {
      return { valid: false, reason: resolution.reason };
    }

    played.add(play.tileId);
    tiles.push(resolution.play);
    word += resolution.play.letters.join("");
  }

  if (word.length < MIN_WORD_LETTERS) {
    return { valid: false, reason: "too-short" };
  }
  if (!dictionary.has(word)) {
    return { valid: false, reason: "not-in-dictionary" };
  }

  return { valid: true, word, dictionary: dictionary.id, tiles };
}
