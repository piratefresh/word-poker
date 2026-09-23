import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OfflineAction, Tile, WordSubmission } from "@wordpoker/contracts";

import {
  BOT_BET_STEPS,
  BOT_CALL_THRESHOLD,
  BOT_RAISE_FREQUENCY,
  BOT_BET_FREQUENCY,
  chooseOfflineWord,
  decideOfflineMove,
} from "../src/bot";
import { bettingBounds, type BettingBounds } from "../src/betting";
import { resolveSubmission } from "../src/building";
import { LETTER_VALUES, type Letter } from "../src/letters";
import { OfflineActionError } from "../src/errors";
import { availableTiles, reduce, startHand, type OfflineState } from "../src/offline";
import { TEST_DICTIONARY, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function dealHand(seed = 4242): OfflineState {
  return startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
}

function actingSeatId(state: OfflineState): string {
  const index = state.toActIndex;
  const seat = index === null ? undefined : state.seats[index];
  assert.ok(seat, "a seat is to act");
  return seat.id;
}

/** Whether an action is one the seat's bounds enable — the set the bot must stay inside. */
function enabled(bounds: BettingBounds, action: OfflineAction): boolean {
  switch (action.type) {
    case "fold":
      return bounds.canFold;
    case "check":
      return bounds.canCheck;
    case "bet":
      return bounds.canBet;
    case "call":
      return bounds.canCall;
    case "raise":
      return bounds.canRaise;
    case "allIn":
      return false;
    default:
      return false;
  }
}

describe("decideOfflineMove — the scripted line", () => {
  /**
   * One seat's pinned turn for seed 4242: the tree's rolls are a function of the hand's seed,
   * the street and the seat, so this line is the bot's whole preflop for that table. It starts at
   * mira, the first dealt-in seat clockwise from the big blind, and ends with the big blind
   * checking the blind it posted (§15). Re-pin it only when the tree itself changes.
   */
  const OPENING_LINE: readonly {
    readonly phase: OfflineState["phase"];
    readonly seat: number;
    readonly action: OfflineAction;
  }[] = [
    { phase: "preflop", seat: 3, action: { type: "call", playerId: "mira" } },
    { phase: "preflop", seat: 0, action: { type: "call", playerId: "hero" } },
    { phase: "preflop", seat: 1, action: { type: "call", playerId: "ellis" } },
    { phase: "preflop", seat: 2, action: { type: "check", playerId: "jay" } },
  ];

  it("plays exactly the pinned line, then lets the street roll", () => {
    let state = dealHand();

    for (const expected of OPENING_LINE) {
      const seat = state.seats[expected.seat];
      assert.ok(seat, `seat ${expected.seat}`);
      assert.equal(state.phase, expected.phase);
      assert.equal(state.toActIndex, expected.seat);
      assert.deepEqual(decideOfflineMove(state, seat.id), expected.action);
      state = reduce(state, decideOfflineMove(state, seat.id), NOW);
    }

    assert.equal(state.phase, "flop");
    // Every seat ends the pre-flop on the big blind: the small blind pays the difference and the
    // big blind's own check is what closed the round (§23, §15).
    assert.deepEqual(
      state.seats.map((seat) => seat.committedHand),
      [20, 20, 20, 20],
    );
  });

  it("returns the same move for the same state", () => {
    const state = dealHand();

    assert.deepEqual(decideOfflineMove(state, "mira"), decideOfflineMove(state, "mira"));
  });

  it("refuses to move out of turn, or for a player who is not seated", () => {
    const state = dealHand();

    assert.throws(
      () => decideOfflineMove(state, "hero"),
      (error: unknown) =>
        error instanceof OfflineActionError && error.message.includes("hero"),
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
});

describe("decideOfflineMove — a table of bots", () => {
  /** Plays a whole hand with every seat on the bot policy: words included, then the payout. */
  function playAll(seed: number): { state: OfflineState; actions: number } {
    let state = startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
    let actions = 0;

    while (state.phase !== "payout") {
      if (state.wordWindow?.status === "open") {
        for (const slot of state.wordWindow.slots) {
          const word = chooseOfflineWord({
            available: availableTiles(state, slot.seat),
            dictionary: TEST_DICTIONARY,
          });
          if (word !== null) {
            state = reduce(state, { type: "confirmWord", playerId: slot.playerId, submission: word }, NOW);
          }
        }
        state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
        continue;
      }

      const index = state.toActIndex;
      assert.ok(index !== null, "a seat is to act");
      const seat = state.seats[index];
      const round = state.betting;
      assert.ok(seat, `seat ${index}`);
      assert.ok(round, "a betting round is open");

      const action = decideOfflineMove(state, seat.id);

      // The property: every action the tree returns is one the bounds enable, so the engine
      // has no reason to refuse it.
      const bounds = bettingBounds(state.seats, round, index, state.stakes.bigBlind);
      assert.ok(bounds, `seat ${index} can act`);
      assert.ok(enabled(bounds, action), `expected ${JSON.stringify(action)} to be enabled`);

      state = reduce(state, action, NOW);
      actions += 1;
      assert.ok(actions <= 40, "a bot hand is a bounded walk");
    }

    return { state, actions };
  }

  it("drives a full hand to the payout with the chips conserved", () => {
    for (const seed of [4242, 4243, 4244]) {
      const { state } = playAll(seed);

      assert.equal(state.phase, "payout");
      assert.equal(state.betting, null);
      assert.equal(
        state.seats.reduce((total, seat) => total + seat.stack, 0),
        SEATS.length * 1_000,
        `seed ${seed} conserved its chips`,
      );
      assert.equal(
        state.result?.payout.stackDeltas.reduce((total, delta) => total + (delta.end - delta.start), 0),
        0,
        `seed ${seed} balanced its deltas`,
      );
    }
  });

  it("stays inside the tree's own constants", () => {
    // The tree is the policy: these are its numbers, and a change to any of them is a
    // deliberate change to how bots play (and to the pinned line above). Its bet sizes are read
    // off the table rather than baked in, so the same tree plays a 10/20 and a 50/100 table.
    assert.deepEqual([...BOT_BET_STEPS], [1, 2, 3]);
    assert.equal(BOT_CALL_THRESHOLD, 100);
    assert.ok(Math.abs(BOT_BET_FREQUENCY - 0.2) < 1e-9);
    assert.ok(Math.abs(BOT_RAISE_FREQUENCY - 0.15) < 1e-9);
  });

  it("opens for a multiple of the table's big blind, never a buried size", () => {
    // seed 4242's line, played out by bots: the turn's opening bet is 40 and the river's is 60.
    // Neither is a literal in the tree — both are the table's own big blind times a step, which
    // is what lets the same policy sit down at a 50/100 table.
    let state = dealHand();
    const bets: number[] = [];

    while (state.phase !== "payout" && bets.length < 2) {
      if (state.wordWindow?.status === "open") {
        state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
        continue;
      }

      const index = state.toActIndex;
      assert.ok(index !== null, "a seat is to act");
      const seat = state.seats[index];
      assert.ok(seat, `seat ${index}`);
      const action = decideOfflineMove(state, seat.id);
      if (action.type === "bet") bets.push(action.amount);
      state = reduce(state, action, NOW);
    }

    assert.deepEqual(bets, [40, 60]);
    assert.deepEqual(
      bets.map((amount) => amount / state.stakes.bigBlind),
      [2, 3],
    );
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
