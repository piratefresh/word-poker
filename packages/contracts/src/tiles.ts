/**
 * A tile as it crosses the wire: its identity, the face or faces it prints, and what each
 * face is worth.
 *
 * Two shapes, because the rules give two kinds of tile two different behaviours
 * (docs/rules/tiles.md §10): a single letter plays itself; a **choice** tile (A/E, Q/K)
 * plays either face — one letter per submission, never both. Every two-letter tile is a
 * choice tile (ADR 0005). The union is the point: building and scoring can tell the kinds
 * apart from the type alone, rather than from a flag both would have to agree on.
 *
 * Values are per face (`points`, plus the second face's own) because faces need not agree:
 * some pairs are equal-valued, and the rules' pair pool includes Q/K, which are not.
 * `LetterMultiplier` rides on the tile because a multiplier belongs to the physical tile
 * (§9) — print it once and every letter on the tile carries it.
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

/**
 * A blank (§44, Blank Tile): any letter, worth nothing. It prints "?" and the seat names the
 * letter it plays through the play's `chosenFace`; it never carries a multiplier.
 */
export interface BlankTile extends LetterTile {
  letter: "?";
  points: 0;
  blank: true;
}

/** Every tile a hand can hold: the bag's single letters, the deal's choice tiles, and a power's blank (§6, §10). */
export type Tile = LetterTile | ChoiceTile | BlankTile;
