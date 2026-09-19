/**
 * A tile as it crosses the wire: its identity, the face or faces it prints, and what each
 * face is worth.
 *
 * Three shapes, because the rules give three kinds of tile three different behaviours
 * (docs/rules/tiles.md §10): a single letter plays itself; a **choice** tile (A/E, T/S)
 * plays either face — one letter per submission, never both; a **sequence** tile (TH, ER)
 * plays both faces, in the printed order, and may not be split or reversed. The union is
 * the point: building and scoring can tell the kinds apart from the type alone, rather
 * than from a flag all three would have to agree on.
 *
 * Values are per face (`points`, plus the second face's own) because faces need not agree:
 * A/E and T/S happen to be equal-valued, and the rules' choice pairs include Q/K, which
 * are not. `LetterMultiplier` rides on the tile because a multiplier belongs to the
 * physical tile (§9) — print it once and every letter on the tile carries it.
 */

/** A printed letter multiplier (§7): the tile's letters score double, or triple. */
export type LetterMultiplier = "double-letter" | "triple-letter";

/** A single-letter tile: one face, one value. */
export interface LetterTile {
  id: string;
  /** The face printed first — the whole face on a single-letter tile. */
  letter: string;
  /** What the first face is worth (§6 letter values). */
  points: number;
  /** Double/Triple Letter (§7, §9); absent on an ordinary tile. */
  multiplier?: LetterMultiplier;
}

/** A two-letter tile played as either face, one at a time: A/E is A or E, never both. */
export interface ChoiceTile extends LetterTile {
  /** The second face, printed after a slash. */
  alternativeLetter: string;
  /** What the alternative face is worth; it may differ from `points`. */
  alternativePoints: number;
}

/** A two-letter tile played as both faces, in the printed order: TH is T then H. */
export interface SequenceTile extends LetterTile {
  /** The second face, printed immediately after the first. */
  sequenceLetter: string;
  /** What the sequence's second face is worth. */
  sequencePoints: number;
}

/** Every tile a bag can hold: the 98 single letters and the two-letter tiles (§6, §10). */
export type Tile = LetterTile | ChoiceTile | SequenceTile;
