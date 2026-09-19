/**
 * Scoring (docs/rules/scoring.md §6–§9): what a word is worth, and who wins the table.
 *
 * `scoreWord` takes the build step's resolution — the played tiles, each with the letters it
 * contributed and their printed values — and walks §7: add the letters (step 1), let each
 * tile's Double/Triple Letter multiplier apply to every letter it printed (step 2), then add
 * the flat Full Rack Bonus when all seven physical tiles were used (step 3). It consumes the
 * resolution rather than the word string, so the face a choice tile played and the two
 * letters of a sequence tile are already pinned by the time anything is added up: scoring
 * never re-reads a tile, and cannot disagree with building about what was spelled.
 *
 * `pickWinner` and `ScoredPlayer` are the table's half of the module: "highest score, ties to
 * the lowest seat" is a property of the table, not of how a score was computed, so the same
 * functions serve the real path and the placeholder below.
 *
 * Everything here is deterministic and pure: same tiles in, same numbers out, no clock and no
 * ambient randomness — it reads nothing outside its arguments, so the client can recompute a
 * score the server reported without drifting from it.
 */

import type {
  LetterMultiplier,
  PlayerId,
  Tile,
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

/**
 * One player's standing at the table, reduced to what awarding the pot needs.
 *
 * `seat` is the seat index the player occupies, and it is the only tie-breaker: seating
 * is fixed when the hand starts, so two players on equal scores always resolve the same
 * way no matter what order the engine happens to hand them over in.
 */
export interface ScoredPlayer {
  id: PlayerId;
  score: number;
  seat: number;
}

/**
 * Raised when a winner is asked for but no player is sitting at the table.
 *
 * A named type rather than a bare `Error` so callers can catch exactly this and let
 * anything else keep propagating — an empty table is a caller bug (they asked for a
 * result before anyone was dealt in), not a rendered game state.
 */
export class NoPlayersError extends Error {
  constructor() {
    super("pickWinner requires at least one player, but the table is empty");
    this.name = "NoPlayersError";
  }
}

/**
 * PLACEHOLDER — totals the printed point value of every tile a player is showing.
 *
 * The offline vertical slice (STO-284) has no word submission yet, so its payout cannot use
 * `scoreWord`: there is nothing played to score, and per the rules an unplayed rack is worth
 * zero rather than its tile values. This keeps the slice producing a winner until STO-305
 * gives it a word builder and moves payout onto the real path, at which point this function
 * and its callers go together.
 *
 * @param privateTiles The tiles dealt to this player.
 * @param community The shared tiles, the same for every player at the table.
 * @returns The sum of `points` over both lists; `0` when the player holds nothing.
 */
export function scoreHand(privateTiles: readonly Tile[], community: readonly Tile[]): number {
  let total = 0;

  // Plain loops: this is on the hot path of every hand reveal and must not allocate an
  // intermediate array just to add numbers up.
  for (const tile of privateTiles) {
    total += tile.points;
  }
  for (const tile of community) {
    total += tile.points;
  }

  return total;
}

/**
 * Picks the winner: the highest score, and on a tie the lowest seat number.
 *
 * The tie-break is applied while scanning, not after, so the result does not depend on
 * the order `players` arrives in. A stable scan beats sorting here — it is O(n) with no
 * allocation, and there is only ever one winner to find.
 *
 * @param players The seated players and their scores, in any order.
 * @returns The `id` of the winning player.
 * @throws {NoPlayersError} When `players` is empty and there is no winner to name.
 */
export function pickWinner(players: readonly ScoredPlayer[]): PlayerId {
  const first = players[0];
  if (first === undefined) {
    throw new NoPlayersError();
  }

  let winner = first;
  for (const player of players) {
    const beatsWinner = player.score > winner.score;
    const tiesButSitsEarlier = player.score === winner.score && player.seat < winner.seat;
    if (beatsWinner || tiesButSitsEarlier) {
      winner = player;
    }
  }

  return winner.id;
}
