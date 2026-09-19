import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import { dealHand, reduce, startHand, type OfflineState } from "../src/index";
import { testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

/** How many turns a hand takes to reach the river's close: four streets, every seat each. */
const TURNS_TO_RIVER_END = SEATS.length * 4;

/**
 * The deal `startHand` will make for this seed. Read here so the fixture knows the letters
 * before it builds the dictionary — the same seed and the same default table settings deal
 * the same tiles, so the two never disagree.
 */
const DEAL = dealHand({ seed: SEED, playerCount: SEATS.length });

/** Plays every tile of a hand, in the order given, and spells the word they print (§10). */
function spell(tiles: readonly Tile[]): { submission: WordSubmission; word: string } {
  const plays: TilePlay[] = [];
  let word = "";

  for (const tile of tiles) {
    if ("alternativeLetter" in tile) {
      plays.push({ tileId: tile.id, chosenFace: tile.letter });
      word += tile.letter;
    } else if ("sequenceLetter" in tile) {
      plays.push({ tileId: tile.id });
      word += `${tile.letter}${tile.sequenceLetter}`;
    } else {
      plays.push({ tileId: tile.id });
      word += tile.letter;
    }
  }

  return { submission: { plays }, word };
}

/** The submission a seat's own two private tiles make — a word only that seat can build. */
function privateWord(seat: number): { submission: WordSubmission; word: string } {
  return spell(DEAL.privateTiles[seat] ?? []);
}

const HERO_WORD = privateWord(0);
const OTHER_WORD = privateWord(1);
const REFUSED_WORD = privateWord(2);

// The fixture is only meaningful while those words differ: a refused word that happened to be
// one of the table's words would be judged valid, and the test would pass for the wrong reason.
assert.notEqual(REFUSED_WORD.word, HERO_WORD.word);
assert.notEqual(REFUSED_WORD.word, OTHER_WORD.word);

/** The table's words: exactly what the seats under test can spell, and nothing else. */
const DICTIONARY = testDictionary([HERO_WORD.word, OTHER_WORD.word]);

/**
 * §7 in the test's own arithmetic: every letter at its §6 value, doubled or tripled by the
 * multiplier on the tile that prints it. Derived from the tiles rather than from `scoreWord`,
 * so it is a second opinion and not the engine agreeing with itself.
 */
function expectedScore(tiles: readonly Tile[]): number {
  return tiles.reduce((total, tile) => {
    const factor = tile.multiplier === "triple-letter" ? 3 : tile.multiplier === "double-letter" ? 2 : 1;
    const faces = "sequenceLetter" in tile ? [tile.points, tile.sequencePoints] : [tile.points];
    return total + faces.reduce((sum, points) => sum + points * factor, 0);
  }, 0);
}

/** A hand walked to the river's close, where §19's window opens. */
function atWindow(wordBuilding?: { autoSubmitDrafts?: boolean }): OfflineState {
  let state = startHand({
    seed: SEED,
    players: SEATS,
    nowMs: NOW,
    dictionary: DICTIONARY,
    ...(wordBuilding === undefined ? {} : { wordBuilding }),
  });

  for (let turn = 0; turn < TURNS_TO_RIVER_END; turn += 1) {
    state = reduce(state, { type: "advance" }, NOW + turn);
  }

  return state;
}

/** One seat confirms its word inside the window. */
function confirm(state: OfflineState, seat: number, submission: WordSubmission): OfflineState {
  return reduce(state, { type: "confirmWord", playerId: SEATS[seat] ?? "", submission }, NOW + 1);
}

/** §19's window closed with the clock run out, which is how a hand reaches its payout. */
function payOut(state: OfflineState): OfflineState {
  return reduce(state, { type: "timeoutWords" }, state.endsAtMs);
}

describe("payout — §11's judging and §21's ladder", () => {
  it("awards the hand to the best word, with §7's score and §11's reason on every seat", () => {
    const paid = payOut(confirm(atWindow(), 0, HERO_WORD.submission));
    const result = paid.result;

    assert.ok(result !== null);
    assert.equal(paid.phase, "payout");
    assert.equal(result.standings.length, SEATS.length);
    assert.equal(result.winner, "hero");

    const [best, ...rest] = result.standings;
    assert.equal(best?.playerId, "hero");
    assert.equal(best?.word, HERO_WORD.word);
    assert.equal(best?.reason, null);
    assert.equal(best?.score, expectedScore(DEAL.privateTiles[0] ?? []));
    assert.equal(best?.place, 1);

    // Nobody else confirmed a word, so §11 places them at 0 — and the clock, not the
    // dictionary, is what refused them.
    for (const standing of rest) {
      assert.equal(standing.score, 0);
      assert.equal(standing.word, null);
      assert.equal(standing.reason, "timer-expired");
    }
    assert.deepEqual(
      result.standings.map((standing) => standing.place),
      [1, 2, 3, 4],
    );
  });

  it("scores a word the table does not count at 0, with the reason §11 gave", () => {
    const paid = payOut(confirm(atWindow(), 2, REFUSED_WORD.submission));
    const refused = paid.result?.standings.find((standing) => standing.playerId === "jay");

    assert.equal(refused?.reason, "not-in-dictionary");
    assert.equal(refused?.word, null);
    assert.equal(refused?.score, 0);
  });

  it("settles a table where nobody has a word with §21.3's draw, not a shared first place", () => {
    const result = payOut(atWindow()).result;

    assert.ok(result !== null);
    assert.equal(result.standings.length, SEATS.length);
    assert.deepEqual(
      result.standings.map((standing) => standing.place),
      [1, 2, 3, 4],
    );
    assert.ok(result.standings.every((standing) => standing.score === 0 && standing.reason === "timer-expired"));
    assert.ok(
      result.comparisons.some((comparison) => comparison.step === "tile-draw"),
      "four seats on 0 points have nothing to compare but the draw",
    );
    assert.equal(result.winner, result.standings[0]?.playerId);
  });

  it("judges a draft the table confirmed for a seat at the deadline", () => {
    const drafted = reduce(
      atWindow({ autoSubmitDrafts: true }),
      { type: "draftWord", playerId: "hero", submission: HERO_WORD.submission },
      NOW + 1,
    );
    const paid = payOut(drafted);
    const hero = paid.result?.standings.find((standing) => standing.playerId === "hero");

    assert.equal(hero?.word, HERO_WORD.word);
    assert.equal(hero?.score, expectedScore(DEAL.privateTiles[0] ?? []));
    assert.equal(paid.result?.winner, "hero");
  });

  it("replays the same payout for the same seed and action sequence", () => {
    const once = payOut(confirm(atWindow(), 0, HERO_WORD.submission));
    const twice = payOut(confirm(atWindow(), 0, HERO_WORD.submission));

    assert.deepEqual(once.result, twice.result);
  });

  it("clears the result with the next hand", () => {
    const paid = payOut(confirm(atWindow(), 0, HERO_WORD.submission));
    const next = reduce(paid, { type: "deal" }, NOW);

    assert.equal(next.hand, 2);
    assert.equal(next.result, null);
    assert.equal(next.wordWindow, null);
  });
});
