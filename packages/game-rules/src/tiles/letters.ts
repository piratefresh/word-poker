/**
 * Letter values (docs/rules/scoring.md §6): the one table of what a printed letter is
 * worth before any tile multiplier touches it.
 *
 * It is the package's single source for those numbers. The tile bag takes its
 * single-letter points from here instead of transcribing them a second time, and scoring
 * reads the values off the tiles the build step resolved — so there is no second copy to
 * drift. The drift-guard test parses §6's table back out of the rules document and fails on
 * any mismatch, which is what keeps this map and the table the players read from being two
 * different games.
 */

/**
 * The letter→value tiers of §6, transcribed as `A: 1, B: 4, … Z: 10`.
 *
 * Private so the only way to reach these numbers is {@link LETTER_VALUES}: a `const` object
 * is writable at runtime, and a second binding to it would be a second thing that could
 * disagree with the rules.
 */
const VALUES = {
  A: 1,
  B: 4,
  C: 4,
  D: 3,
  E: 1,
  F: 5,
  G: 3,
  H: 5,
  I: 1,
  J: 8,
  K: 5,
  L: 2,
  M: 4,
  N: 2,
  O: 1,
  P: 4,
  Q: 10,
  R: 2,
  S: 2,
  T: 2,
  U: 1,
  V: 5,
  W: 5,
  X: 8,
  Y: 5,
  Z: 10,
} as const;

/** A letter a tile can print: the 26 faces of §6's table, and nothing else. */
export type Letter = keyof typeof VALUES;

/**
 * What each letter is worth (§6).
 *
 * Frozen because it is shared state in the same sense the tile bag is: a caller that could
 * assign to it would change what every other module scores — and unlike the bag, there is
 * no per-table copy to hand out instead.
 */
export const LETTER_VALUES: Readonly<Record<Letter, number>> = Object.freeze(VALUES);
