import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import { bettingBounds } from "../src/betting";
import { dealHand, reduce, startHand, type OfflineState } from "../src/index";
import { testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

/**
 * The commitment every seat ends the hand on: the big blind, called around. Enough for a real pot
 * without changing the deal — pre-flop the blinds are already out, so every other seat owes the
 * big blind and the big blind itself merely checks (§23).
 */
const OPENING_BET = 20;

/**
 * The deal `startHand` will make for this seed. Read here so the fixture knows the letters
 * before it builds the dictionary — the same seed and the same default table settings deal
 * the same tiles, and betting consumes no randomness, so the two never disagree.
 */
const DEAL = dealHand({ seed: SEED, playerCount: SEATS.length });

/**
 * Plays every tile of a hand, in the order given, and spells the word they print (§10): a
 * choice tile plays the first face it prints, and a single letter plays itself.
 */
function spell(tiles: readonly Tile[]): { submission: WordSubmission; word: string } {
  const plays: TilePlay[] = [];
  let word = "";

  for (const tile of tiles) {
    plays.push("alternativeLetter" in tile ? { tileId: tile.id, chosenFace: tile.letter } : { tileId: tile.id });
    word += tile.letter;
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
    // One letter per tile (§10), and this fixture plays the face a tile prints first, which is
    // the one `points` carries.
    return total + tile.points * factor;
  }, 0);
}

/**
 * A hand walked to the river's close, where §19's window opens: the blinds are called around
 * pre-flop — the big blind checking its own blind — and every street after is checked around.
 * Every seat ends the hand on the same 20-chip commitment, so the hand has one 80-chip pot to
 * award.
 */
function atWindow(wordBuilding?: { autoSubmitDrafts?: boolean }): OfflineState {
  let state = startHand({
    seed: SEED,
    players: SEATS,
    nowMs: NOW,
    dictionary: DICTIONARY,
    ...(wordBuilding === undefined ? {} : { wordBuilding }),
  });

  let step = 0;
  while (state.wordWindow?.status !== "open") {
    const index = state.toActIndex;
    assert.ok(index !== null, "a seat is to act");
    const seat = state.seats[index];
    const round = state.betting;
    assert.ok(seat, `seat ${index}`);
    assert.ok(round, "a betting round is open");

    const bounds = bettingBounds(state.seats, round, index, state.stakes.bigBlind);
    assert.ok(bounds, `seat ${index} can act`);
    const action = bounds.canCheck
      ? ({ type: "check", playerId: seat.id } as const)
      : ({ type: "call", playerId: seat.id } as const);

    state = reduce(state, action, NOW + step);
    step += 1;
    assert.ok(step <= SEATS.length * 8, "the polite line is a bounded walk");
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

  it("moves the pot into the winner's stack, and conserves the table's chips (§24, §25)", () => {
    const paid = payOut(confirm(atWindow(), 0, HERO_WORD.submission));
    const payout = paid.result?.payout;

    assert.ok(payout !== undefined);
    assert.deepEqual(
      payout.pots.map((pot) => [pot.amount, pot.winners]),
      [[OPENING_BET * SEATS.length, ["hero"]]],
    );
    assert.equal(paid.seats[0]?.stack, 1_000 - OPENING_BET + OPENING_BET * SEATS.length);
    // Every other seat paid its call and lost it.
    assert.deepEqual(
      paid.seats.slice(1).map((seat) => seat.stack),
      [1_000 - OPENING_BET, 1_000 - OPENING_BET, 1_000 - OPENING_BET],
    );
    assert.equal(
      paid.seats.reduce((total, seat) => total + seat.stack, 0),
      SEATS.length * 1_000,
    );
    assert.equal(
      payout.stackDeltas.reduce((total, delta) => total + (delta.end - delta.start), 0),
      0,
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
    // The pot's ladder runs from the same seed as the reveal's, so the seat the reveal put
    // first is the seat the pot paid.
    assert.deepEqual(result.payout.pots[0]?.winners, [result.winner]);
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

  it("clears the result with the next hand, carrying what the last one left", () => {
    const paid = payOut(confirm(atWindow(), 0, HERO_WORD.submission));
    const next = reduce(paid, { type: "deal" }, NOW);

    assert.equal(next.hand, 2);
    assert.equal(next.result, null);
    assert.equal(next.wordWindow, null);
    assert.equal(next.dealerSeat, 1);
    // What the last hand left, and then the new hand's blinds off the seats that post them: the
    // button moved to seat 1, so the small blind is seat 2's and the big blind seat 3's (§5).
    assert.deepEqual(
      next.seats.map((seat) => seat.stack),
      [1_060, 980, 970, 960],
    );
    assert.deepEqual(
      next.seats.map((seat) => seat.committedHand),
      [0, 0, 10, 20],
    );
  });
});
