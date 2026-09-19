import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import { NoPlayersError, pickWinner, scoreHand, type ScoredPlayer } from "../src/scoring";

/**
 * Builds a tile the way the bag deals one: a single letter, or — when a second face is
 * given — the choice tile shape `@wordpoker/contracts` pins, with both faces valued.
 */
function tile(letter: string, points: number, alternativeLetter?: string): Tile {
  if (alternativeLetter === undefined) {
    return { id: letter, letter, points };
  }
  return {
    id: `${letter}/${alternativeLetter}`,
    letter,
    points,
    alternativeLetter,
    alternativePoints: points,
  };
}

describe("scoreHand", () => {
  it("totals the printed points of the private and community tiles", () => {
    const privateTiles = [tile("Q", 10), tile("A", 1), tile("D", 3)];
    const community = [tile("T", 2, "S"), tile("M", 4), tile("Z", 10)];

    // 10 + 1 + 3 private, 2 + 4 + 10 community.
    assert.equal(scoreHand(privateTiles, community), 30);
  });

  it("counts a two-letter choice tile once at its printed value, not as both letters", () => {
    // The choice tile is worth the face printed first (A/E are 1, T/S are 2); the unused
    // alternative must not be added on top, and both letters must not be scored separately.
    assert.equal(scoreHand([tile("A", 1, "E"), tile("T", 2, "S")], []), 3);
  });

  it("scores nothing when no tiles are on the table", () => {
    assert.equal(scoreHand([], []), 0);
  });

  it("adds only the tiles on the side that has them", () => {
    assert.equal(scoreHand([], [tile("K", 5), tile("V", 5)]), 10);
    assert.equal(scoreHand([tile("X", 8)], []), 8);
  });
});

describe("pickWinner", () => {
  it("awards the pot to the highest score even from the worst seat", () => {
    const players: ScoredPlayer[] = [
      { id: "low-seat", score: 12, seat: 0 },
      { id: "high-score", score: 41, seat: 5 },
      { id: "middle", score: 20, seat: 3 },
    ];

    assert.equal(pickWinner(players), "high-score");
  });

  it("breaks a tie with the lowest seat regardless of the order given", () => {
    const tied: ScoredPlayer[] = [
      { id: "seat-4", score: 25, seat: 4 },
      { id: "seat-1", score: 25, seat: 1 },
      { id: "seat-3", score: 25, seat: 3 },
    ];

    assert.equal(pickWinner(tied), "seat-1");
    // Same table, reversed arrival order: the winner must not change.
    assert.equal(pickWinner([...tied].reverse()), "seat-1");
  });

  it("throws a NoPlayersError naming the problem when nobody is seated", () => {
    assert.throws(() => pickWinner([]), NoPlayersError);
    assert.throws(() => pickWinner([]), /at least one player/);
  });
});
