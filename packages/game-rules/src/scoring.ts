/**
 * Scoring (docs/rules/scoring.md §6–§9): what a word is worth.
 *
 * `scoreWord` takes the build step's resolution — the played tiles, each with the letters it
 * contributed and their printed values — and walks §7: add the letters (step 1), let each
 * tile's Double/Triple Letter multiplier apply to every letter it printed (step 2), then add
 * the flat Full Rack Bonus when all seven physical tiles were used (step 3). It consumes the
 * resolution rather than the word string, so the face a choice tile played and the two
 * letters of a sequence tile are already pinned by the time anything is added up: scoring
 * never re-reads a tile, and cannot disagree with building about what was spelled.
 *
 * Who wins the table is not here: that is §21's ladder in `./showdown`, which ranks every
 * seat by these scores and breaks the ties.
 *
 * Everything here is deterministic and pure: same tiles in, same numbers out, no clock and no
 * ambient randomness — it reads nothing outside its arguments, so the client can recompute a
 * score the server reported without drifting from it.
 */

import type {
  LetterMultiplier,
  TilePlayResolution,
  WordLetterScore,
  WordScore,
} from "@wordpoker/contracts";

import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "./deal";

/**
 * §7.2/§9: what a printed multiplier does to the letters of its tile. A map rather than an
 * `if` chain so the two kinds are one lookup, and so a third kind added to the contract
 * fails to compile here instead of silently scoring as 1×.
 */
const MULTIPLIER_FACTORS: Readonly<Record<LetterMultiplier, number>> = {
  "double-letter": 2,
  "triple-letter": 3,
};

/**
 * §7.3: the physical tiles a seat can play — its two private tiles and the five community
 * tiles. Taken from the deal's constants rather than written as `7`, so the bonus follows a
 * table whose shape changes and cannot outlive the deal that defines it.
 */
const RACK_TILES = PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT;

/** §7.3: what playing the whole rack is worth. Flat by rule — no multiplier may touch it. */
const FULL_RACK_BONUS = 10;

/**
 * §7.2/§9: what a printed multiplier does to the letters of its tile — 1 for a tile that
 * carries none.
 *
 * Exported because a walk that scores a play the moment it is played (`./word-search`) adds
 * the tile's contribution to a running total, and §7's factor has to mean the same thing on
 * both paths or the search and the showdown would disagree about what a word is worth.
 */
export function multiplierFactor(multiplier: LetterMultiplier | undefined): number {
  return multiplier === undefined ? 1 : MULTIPLIER_FACTORS[multiplier];
}

/**
 * §7.3: what playing `tileCount` physical tiles adds on top of the letter score — the flat
 * bonus for a full rack, and nothing for anything shorter.
 *
 * Exported for the same reason as {@link multiplierFactor}: a running total needs the rule,
 * not the whole breakdown.
 */
export function fullRackBonus(tileCount: number): number {
  return tileCount === RACK_TILES ? FULL_RACK_BONUS : 0;
}

/**
 * Scores an already-validated word (docs/rules/scoring.md §7).
 *
 * The letters come out in word order with their multipliers already applied, so the reveal
 * UI can put a value on every tile it draws, and `letterScore` is exactly the sum of those
 * values. The Full Rack Bonus counts physical tiles, never letters: a sequence tile is one
 * tile however many letters it prints, so a nine-letter word built from seven tiles still
 * earns the bonus, and a seven-letter word built from six does not.
 *
 * @param tiles The played tiles as `evaluateWord` resolved them, in word order.
 * @returns The §7 breakdown: per-letter values, the modified letter score, the rack bonus,
 *   and the final score the hand is ranked by.
 */
export function scoreWord(tiles: readonly TilePlayResolution[]): WordScore {
  const letters: WordLetterScore[] = [];
  let letterScore = 0;

  for (const tile of tiles) {
    const factor = multiplierFactor(tile.multiplier);

    for (const { letter, points } of tile.letters) {
      const value = points * factor;
      letterScore += value;
      letters.push({
        letter,
        baseValue: points,
        ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
        value,
      });
    }
  }

  const bonus = fullRackBonus(tiles.length);

  return { letters, letterScore, fullRackBonus: bonus, total: letterScore + bonus };
}
