/**
 * Scoring (docs/rules/scoring.md §6–§9): what a word is worth.
 *
 * `scoreWord` takes the build step's resolution — the played tiles, each with the letters it
 * contributed and their printed values — and walks §7: add the letters (step 1), let each
 * tile's Double/Triple Letter multiplier apply to every letter it printed (step 2), then add
 * the flat Full Rack Bonus when all seven physical tiles were used (step 3). It consumes the
 * resolution rather than the word string, so the face a choice tile played is already pinned
 * by the time anything is added up: scoring never re-reads a tile, and cannot disagree with
 * building about what was spelled.
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

import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "../tiles/deal";

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
 * Scores an already-validated word (docs/rules/scoring.md §7).
 *
 * The letters come out in word order with their multipliers already applied, so the reveal
 * UI can put a value on every tile it draws, and `letterScore` is exactly the sum of those
 * values. The Full Rack Bonus counts physical tiles, never letters — and since every tile,
 * choice tiles included, plays exactly one letter (§10), seven tiles is also §12's longest
 * possible word: a rack played in full is a seven-letter word with the bonus on it.
 *
 * @param tiles The played tiles as `evaluateWord` resolved them, in word order.
 * @returns The §7 breakdown: per-letter values, the modified letter score, the rack bonus,
 *   and the final score the hand is ranked by.
 */
export function scoreWord(tiles: readonly TilePlayResolution[]): WordScore {
  const letters: WordLetterScore[] = [];
  let letterScore = 0;

  for (const tile of tiles) {
    const multiplier = tile.multiplier;
    const factor = multiplier === undefined ? 1 : MULTIPLIER_FACTORS[multiplier];

    for (const { letter, points } of tile.letters) {
      const value = points * factor;
      letterScore += value;
      letters.push({
        letter,
        baseValue: points,
        ...(multiplier === undefined ? {} : { multiplier }),
        value,
      });
    }
  }

  // A full rack is every physical tile on the felt, and no submission can play more than
  // that, so equality is the whole test — there is no "all of" to check separately.
  const fullRackBonus = tiles.length === RACK_TILES ? FULL_RACK_BONUS : 0;

  return { letters, letterScore, fullRackBonus, total: letterScore + fullRackBonus };
}
