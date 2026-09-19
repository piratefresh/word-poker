import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, WordSubmission } from "@wordpoker/contracts";

import { chooseOfflineWord, decideOfflineMove } from "../src/bot";
import { LETTER_VALUES, type Letter } from "../src/letters";
import { resolveSubmission } from "../src/building";
import { OfflineActionError, reduce, startHand, type OfflineState } from "../src/offline";
import { TEST_DICTIONARY, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function dealHand(): OfflineState {
  return startHand({ seed: 4242, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
}

function actingSeatId(state: OfflineState): string {
  const index = state.toActIndex;
  const seat = index === null ? undefined : state.seats[index];
  assert.ok(seat, "a seat is to act");
  return seat.id;
}

describe("decideOfflineMove", () => {
  it("returns the same move for the same state", () => {
    const state = reduce(dealHand(), { type: "advance" }, NOW);
    const bot = actingSeatId(state);

    assert.deepEqual(decideOfflineMove(state, bot), decideOfflineMove(state, bot));
  });

  it("passes its turn when it is the bot's turn", () => {
    const state = reduce(dealHand(), { type: "advance" }, NOW);

    assert.equal(state.toActIndex, 1);
    assert.deepEqual(decideOfflineMove(state, "ellis"), { type: "advance" });
  });

  it("refuses to move out of turn, or for a player who is not seated", () => {
    const state = dealHand();

    assert.throws(
      () => decideOfflineMove(state, "ellis"),
      (error: unknown) =>
        error instanceof OfflineActionError && error.message.includes("ellis"),
    );
    assert.throws(
      () => decideOfflineMove(state, "ghost"),
      (error: unknown) => error instanceof OfflineActionError,
    );
  });

  it("deals once the hand has paid out", () => {
    let state = dealHand();
    while (state.phase !== "payout") {
      // §19's window has no turn for a bot to take, so the table's clock closes it and the
      // bot's next real move is the deal that follows.
      state =
        state.wordWindow?.status === "open"
          ? reduce(state, { type: "timeoutWords" }, state.endsAtMs)
          : reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW);
    }

    assert.deepEqual(decideOfflineMove(state, "ellis"), { type: "deal" });
    assert.equal(reduce(state, decideOfflineMove(state, "ellis"), NOW).hand, 2);
  });

  it("has no move while the word window is open", () => {
    let state = dealHand();
    while (state.wordWindow?.status !== "open") {
      state = reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW);
    }

    assert.throws(
      () => decideOfflineMove(state, "ellis"),
      (error: unknown) => error instanceof OfflineActionError && error.message.includes("word window"),
    );
  });

  it("only ever asks for a legal transition", () => {
    let state = dealHand();
    let moves = 0;

    while (state.phase !== "payout") {
      if (state.wordWindow?.status === "open") {
        state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
        continue;
      }

      state = reduce(state, decideOfflineMove(state, actingSeatId(state)), NOW + moves);
      moves += 1;
      assert.ok(moves <= SEATS.length * 4, "a hand is at most four streets of turns");
    }

    assert.equal(state.phase, "payout");
    assert.ok(moves > 0);
  });
});

/** A single-letter tile as the bag prints it. */
function letter(face: Letter, copy = 1): Tile {
  return { id: `${face}-${copy}`, letter: face, points: LETTER_VALUES[face] };
}

/** A choice tile: one physical tile, two faces, either of them playable (§10). */
function choice(first: Letter, second: Letter): Tile {
  return {
    id: `${first}${second}-1`,
    letter: first,
    points: LETTER_VALUES[first],
    alternativeLetter: second,
    alternativePoints: LETTER_VALUES[second],
  };
}

/** A fixed-sequence tile: both faces, in printed order, on one physical tile (§10). */
function sequence(first: Letter, second: Letter): Tile {
  return {
    id: `${first}${second}-seq-1`,
    letter: first,
    points: LETTER_VALUES[first],
    sequenceLetter: second,
    sequencePoints: LETTER_VALUES[second],
  };
}

/** The word a submission spells, or `null` when the seat cannot build it at all. */
function spelled(available: readonly Tile[], submission: WordSubmission): string | null {
  const resolution = resolveSubmission({ available, submission });
  return resolution.ok ? resolution.word : null;
}

describe("chooseOfflineWord", () => {
  it("returns the same word for the same tiles and dictionary", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];
    const dictionary = testDictionary(["CAT", "CATS", "ACTS", "AS"]);

    assert.deepEqual(
      chooseOfflineWord({ available, dictionary }),
      chooseOfflineWord({ available, dictionary }),
    );
  });

  it("prefers §7's score, then the letter count, then the word itself", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];
    const dictionary = testDictionary(["AS", "SAT", "CAT", "CATS", "ACTS", "CAST", "SCAT"]);

    const submission = chooseOfflineWord({ available, dictionary });

    // Four four-letter words tie on §7's score; §21.1 ties again; the alphabet settles it.
    assert.equal(spelled(available, submission ?? { plays: [] }), "ACTS");
  });

  it("tries both faces of a choice tile", () => {
    const available = [choice("A", "E"), letter("T"), letter("S")];
    const dictionary = testDictionary(["AT", "ET", "SET"]);

    const submission = chooseOfflineWord({ available, dictionary });

    // SET is worth more than either two-letter word, and it is only spellable on the E face.
    assert.equal(spelled(available, submission ?? { plays: [] }), "SET");
  });

  it("plays a fixed-sequence tile as both of its letters, in order", () => {
    const available = [sequence("T", "H"), letter("E"), letter("R"), letter("E", 2)];
    const dictionary = testDictionary(["HER", "THERE", "THREE"]);

    const submission = chooseOfflineWord({ available, dictionary });

    // THERE and THREE tie on both score and length, so the alphabet decides.
    assert.equal(spelled(available, submission ?? { plays: [] }), "THERE");
  });

  it("plays every physical tile at most once", () => {
    const one = [letter("A")];
    const two = [letter("A"), letter("B")];
    const dictionary = testDictionary(["AB", "AAB", "AA"]);

    assert.equal(spelled(two, chooseOfflineWord({ available: two, dictionary }) ?? { plays: [] }), "AB");
    assert.equal(chooseOfflineWord({ available: one, dictionary }), null);
  });

  it("plays the whole rack when the bonus makes it worth it", () => {
    const available: Tile[] = ["A", "B", "C", "D", "E", "F", "G"].map((face) => letter(face as Letter));
    const dictionary = testDictionary(["AB", "ABCDEFG"]);

    const submission = chooseOfflineWord({ available, dictionary });

    // 21 points of letters plus §7.3's +10 for playing all seven; AB would score 5.
    assert.equal(spelled(available, submission ?? { plays: [] }), "ABCDEFG");
  });

  it("returns no word when the tiles spell nothing the table counts", () => {
    const available = [letter("C"), letter("A"), letter("T"), letter("S")];

    assert.equal(chooseOfflineWord({ available, dictionary: testDictionary(["STRONG"]) }), null);
    assert.equal(chooseOfflineWord({ available, dictionary: testDictionary([]) }), null);
  });
});
