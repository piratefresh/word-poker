/**
 * PLACEHOLDER SCORING — this is not Word Poker scoring, it is a stand-in so the
 * offline slice can produce a winner at all.
 *
 * The real rules (docs/FINAL_RULES.md §"Letter Values and Scoring") are an epic of
 * their own: a dictionary plus word validation, hand ranking, letter/tile multipliers,
 * the Full Rack Bonus, and a word-vs-word tie-breaker ladder. None of that exists yet,
 * so this module does the one thing that needs no word at all — adds up the printed
 * `points` on the tiles a player holds, private and community alike.
 *
 * Everything here is deterministic and pure: same tiles in, same number out. It reads
 * no clock and no ambient randomness (it reads nothing outside its arguments), so the
 * client can recompute a score the server reported without drifting from it. When the
 * word-scoring epic lands, `scoreHand` is the single function to replace; `pickWinner`
 * and `ScoredPlayer` below are meant to survive it, because "highest score, ties to the
 * lowest seat" is a property of the table, not of how the score was computed.
 */

import type { PlayerId, Tile } from "@wordpoker/contracts";

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
 * Totals the printed point value of every tile a player is showing.
 *
 * Private and community tiles both count, and each physical tile counts once — a
 * two-letter choice tile contributes its own `points` (the value of its higher letter,
 * per docs/FINAL_RULES.md), not the sum of the letters it can stand for. The
 * `alternativeLetter` is carried through for display and the future word check; it has
 * no effect on this placeholder arithmetic.
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
