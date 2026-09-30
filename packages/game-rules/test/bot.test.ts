import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OfflineAction, Tile, WordSubmission } from "@wordpoker/contracts";

import { chooseOfflineWord, decideOfflineMove } from "../src/bot";
import { botDecisionSeed, observeBot } from "../src/bot-observation";
import { botProfile } from "../src/bot-profile";
import { assessBotStrength } from "../src/bot-strength";
import { bettingBounds, applyBettingAction, type BettingBounds } from "../src/betting";
import { resolveSubmission } from "../src/building";
import { loadDictionary } from "../src/dictionary";
import { LETTER_VALUES, type Letter } from "../src/letters";
import { OfflineActionError } from "../src/errors";
import { availableTiles, reduce, startHand, type OfflineState } from "../src/offline";
import { TEST_DICTIONARY, cloneState, testDictionary } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function dealHand(seed = 4242): OfflineState {
  return startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
}

function actingSeatId(state: OfflineState): string {
  const seat = state.toActIndex === null ? undefined : state.seats[state.toActIndex];
  assert.ok(seat);
  return seat.id;
}

function enabled(bounds: BettingBounds, action: OfflineAction): boolean {
  switch (action.type) {
    case "fold": return bounds.canFold;
    case "check": return bounds.canCheck;
    case "bet": return bounds.canBet && action.amount >= bounds.bigBlind && action.amount <= bounds.maxRaiseTo;
    case "call": return bounds.canCall;
    case "raise": return bounds.canRaise && action.amount >= bounds.minRaiseTo && action.amount <= bounds.maxRaiseTo;
    case "allIn": return bounds.canAllIn;
    default: return false;
  }
}

function scenario(options: {
  seat?: number;
  seed?: number;
  cost?: number;
  stack?: number;
  privateTiles?: readonly Tile[];
  board?: readonly Tile[];
  words?: readonly string[];
  closed?: boolean;
} = {}): OfflineState {
  const seat = options.seat ?? 1;
  const cost = options.cost ?? 0;
  return {
    ...dealHand(options.seed),
    phase: "river",
    revealed: 5,
    toActIndex: seat,
    community: options.board ?? [letter("A"), letter("T"), letter("S"), letter("E"), letter("R")],
    dictionary: testDictionary(options.words ?? ["AT", "RAT", "STAR", "QI", "QAT", "QATS"]),
    betting: { currentBet: cost, lastRaiseSize: 20 },
    seats: SEATS.map((id, index) => ({
      id, stack: index === seat ? options.stack ?? 1_000 : 1_000,
      committedHand: 100 + (index === seat ? 0 : cost),
      committedRound: index === seat ? 0 : cost,
      folded: false, sittingOut: false, allIn: false,
      actedThisRound: index === seat ? options.closed ?? false : true,
      privateTiles: index === seat ? options.privateTiles ?? [letter("Q"), letter("I")] : [],
    })),
  };
}

function aggressive(action: OfflineAction): boolean {
  return action.type === "bet" || action.type === "raise" || action.type === "allIn";
}

describe("offline bot decisions", () => {
  it("is reproducible and does not mutate its inputs", () => {
    const state = scenario();
    const before = cloneState(state);
    assert.deepEqual(decideOfflineMove(state, "ellis"), decideOfflineMove(state, "ellis"));
    assert.deepEqual(state, before);
  });

  it("rejects turns owned by another seat, missing seats and the word window", () => {
    assert.throws(() => decideOfflineMove(dealHand(), "hero"), OfflineActionError);
    assert.throws(() => decideOfflineMove(dealHand(), "ghost"), OfflineActionError);
    let state = dealHand();
    while (state.wordWindow?.status !== "open") {
      const seat = state.seats[state.toActIndex ?? -1];
      state = reduce(state, { type: (state.betting?.currentBet ?? 0) > (seat?.committedRound ?? 0) ? "call" : "check", playerId: actingSeatId(state) }, NOW);
    }
    assert.throws(() => decideOfflineMove(state, "ellis"), /word window/);
    state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
    assert.deepEqual(decideOfflineMove(state, "ellis"), { type: "deal" });
  });

  it("never reads other racks, private word checks, or unrevealed community tiles", () => {
    for (const phase of ["preflop", "flop", "turn"] as const) {
      const state = scenario();
      state.phase = phase;
      state.revealed = phase === "preflop" ? 0 : phase === "flop" ? 3 : 4;
      const expected = decideOfflineMove(state, "ellis");
      const hidden = cloneState(state);
      hidden.seats.forEach((seat, index) => {
        if (index !== 1) Object.defineProperty(seat, "privateTiles", { get() { throw new Error("hidden rack"); } });
      });
      for (let i = hidden.revealed; i < hidden.community.length; i += 1) {
        Object.defineProperty(hidden.community, i, { get() { throw new Error("future board"); } });
      }
      Object.defineProperty(hidden, "wordChecks", { get() { throw new Error("private checks"); } });
      assert.deepEqual(decideOfflineMove(hidden, "ellis"), expected);
    }
  });

  it("changes random streams with public re-raises, not clocks or hidden assignments", () => {
    const state = scenario();
    assert.ok(state.betting);
    const view = observeBot(state, 1, state.betting);
    assert.notEqual(botDecisionSeed(view, "action"), botDecisionSeed(view, "size"));
    assert.notEqual(botDecisionSeed(view, "action"), botDecisionSeed({ ...view, round: { currentBet: 80, lastRaiseSize: 40 } }, "action"));
    assert.deepEqual(decideOfflineMove({ ...state, endsAtMs: 99 }, "ellis"), decideOfflineMove(state, "ellis"));
  });

  it("calls more than 100 chips with a strong private word and folds a blank river", () => {
    const strong = scenario({ cost: 150, closed: true, privateTiles: [{ ...letter("Q"), multiplier: "double-letter" }, letter("I")] });
    assert.equal(decideOfflineMove(strong, "ellis").type, "call");
    const blank = scenario({ cost: 20, words: [], closed: true });
    assert.equal(decideOfflineMove(blank, "ellis").type, "fold");
    assert.equal(decideOfflineMove(scenario({ words: [] }), "ellis").type, "check");
  });

  it("defends an affordable word but gives it up to an expensive wager", () => {
    const options = { words: ["AT", "CAT"], privateTiles: [letter("C"), letter("O")], closed: true };
    assert.equal(decideOfflineMove(scenario({ ...options, cost: 20 }), "ellis").type, "call");
    assert.equal(decideOfflineMove(scenario({ ...options, cost: 600 }), "ellis").type, "fold");
  });

  it("does not confuse a high scoring shared word with a private advantage", () => {
    const state = scenario({
      board: [letter("Q"), letter("I"), letter("A"), letter("T"), letter("S")],
      privateTiles: [letter("X"), letter("Z")], words: ["QI"],
    });
    assert.ok(state.betting);
    assert.equal(assessBotStrength(observeBot(state, 1, state.betting)).tier, "weak");
  });

  it("keeps profiles stable and gives them observably different tendencies", () => {
    assert.deepEqual([1, 2, 3].map((seat) => botProfile(seat).name), ["cautious", "aggressive", "tricky"]);
    const bets = [0, 0, 0];
    const traps = [0, 0, 0];
    for (let seed = 1; seed <= 256; seed += 1) {
      for (let seat = 1; seat <= 3; seat += 1) {
        const state = scenario({ seat, seed, privateTiles: [{ ...letter("Q"), multiplier: "double-letter" }, letter("I")] });
        const action = decideOfflineMove(state, actingSeatId(state));
        if (aggressive(action)) bets[seat - 1] = (bets[seat - 1] ?? 0) + 1;
        else traps[seat - 1] = (traps[seat - 1] ?? 0) + 1;
      }
    }
    assert.ok((bets[1] ?? 0) > (bets[0] ?? 0) + 30, JSON.stringify(bets));
    assert.ok((traps[2] ?? 0) > (traps[1] ?? 0) + 30, JSON.stringify(traps));
  });

  it("mixes bluffs heads-up but never tries to bluff an all-in opponent", () => {
    let bluffs = 0;
    for (let seed = 1; seed <= 256; seed += 1) {
      const state = scenario({ seat: 3, seed, words: [] });
      state.seats = state.seats.map((seat, i) => ({ ...seat, folded: i === 1 || i === 2 }));
      if (aggressive(decideOfflineMove(state, "mira"))) bluffs += 1;
      state.seats = state.seats.map((seat, i) => i === 0 ? { ...seat, allIn: true, stack: 0 } : seat);
      assert.equal(decideOfflineMove(state, "mira").type, "check");
    }
    assert.ok(bluffs > 5 && bluffs < 100, String(bluffs));
  });

  it("uses capped calls and ignores inaccessible side pots", () => {
    const state = scenario({ cost: 500, stack: 20, words: ["AT", "CAT"], privateTiles: [letter("C"), letter("O")], closed: true });
    assert.equal(decideOfflineMove(state, "ellis").type, "call");
    const before = decideOfflineMove(state, "ellis");
    state.seats = state.seats.map((seat, i) => i === 1 ? seat : { ...seat, committedHand: seat.committedHand + 10_000 });
    assert.deepEqual(decideOfflineMove(state, "ellis"), before);
  });

  it("scales calls and sizes with the stakes rather than an absolute chip threshold", () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const state = scenario({ seed, cost: 40 });
      const action = decideOfflineMove(state, "ellis");
      const scaled = {
        ...state, stakes: { smallBlind: 50, bigBlind: 100 },
        betting: { currentBet: 200, lastRaiseSize: 100 },
        seats: state.seats.map((seat) => ({
          ...seat, stack: seat.stack * 5, committedHand: seat.committedHand * 5, committedRound: seat.committedRound * 5,
        })),
      };
      assert.deepEqual(decideOfflineMove(scaled, "ellis"), "amount" in action ? { ...action, amount: action.amount * 5 } : action);
    }
  });

  it("obeys closed raises and short all-in bounds", () => {
    let shortShoves = 0;
    for (const closed of [false, true]) {
      for (let seed = 1; seed <= 32; seed += 1) {
        const state = scenario({ seed, cost: 20, stack: 30, closed, privateTiles: [{ ...letter("Q"), multiplier: "triple-letter" }, letter("I")] });
        const action = decideOfflineMove(state, "ellis");
        assert.ok(state.betting);
        if (closed) assert.equal(action.type, "call");
        if (action.type === "allIn") shortShoves += 1;
        assert.ok(action.type === "fold" || action.type === "check" || action.type === "call" ||
          action.type === "bet" || action.type === "raise" || action.type === "allIn");
        const result = applyBettingAction(state.seats, state.betting, 1, action, 20);
        assert.ok(result.ok, JSON.stringify(action));
      }
    }
    assert.ok(shortShoves > 0);
  });
});

describe("a table of personality bots", () => {
  it("finishes varied hands with only legal actions and conserved chips", async () => {
    const dictionary = await loadDictionary();
    for (const players of [SEATS.slice(0, 2), SEATS, [...SEATS, "five", "six"]]) {
      for (let seed = 901; seed <= 916; seed += 1) {
        let state = startHand({ seed, players, nowMs: NOW, dictionary });
        let actions = 0;
        while (state.phase !== "payout") {
          if (state.wordWindow?.status === "open") {
            for (const slot of state.wordWindow.slots) {
              if (state.wordWindow?.status !== "open") break;
              const word = chooseOfflineWord({ available: availableTiles(state, slot.seat), dictionary });
              if (word) state = reduce(state, { type: "confirmWord", playerId: slot.playerId, submission: word }, NOW);
            }
            if (state.wordWindow?.status === "open") state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
            continue;
          }
          assert.ok(state.toActIndex !== null && state.betting);
          const action = decideOfflineMove(state, actingSeatId(state));
          const bounds = bettingBounds(state.seats, state.betting, state.toActIndex, state.stakes.bigBlind);
          assert.ok(bounds && enabled(bounds, action), JSON.stringify(action));
          state = reduce(state, action, NOW);
          assert.ok(++actions <= 120, `seed ${seed} must finish`);
        }
        assert.equal(state.seats.reduce((total, seat) => total + seat.stack, 0), players.length * 1_000);
      }
    }
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

  it("plays the lower-scoring face when that is the one the word needs", () => {
    const available = [choice("Q", "K"), letter("I"), letter("T")];
    const dictionary = testDictionary(["KIT"]);

    const submission = chooseOfflineWord({ available, dictionary });

    // Q/K's faces are worth different amounts, and only the cheaper one spells the table's
    // word: the search has to offer both faces (§10) rather than settle for the higher one.
    assert.deepEqual(submission, {
      plays: [{ tileId: "QK-1", chosenFace: "K" }, { tileId: "I-1" }, { tileId: "T-1" }],
    });
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

describe("word search pruning", () => {
  it("matches an unpruned search including duplicate letters, choice faces and multipliers", async () => {
    const dictionary = await loadDictionary();
    const withoutPrefix = { ...dictionary };
    delete withoutPrefix.hasPrefix;
    for (let seed = 40; seed < 48; seed += 1) {
      const state = startHand({ seed, players: SEATS, nowMs: NOW, dictionary });
      const available = [...(state.seats[1]?.privateTiles ?? []), ...state.community];
      assert.deepEqual(
        chooseOfflineWord({ available, dictionary }),
        chooseOfflineWord({ available, dictionary: withoutPrefix }),
      );
    }
    const available = [letter("A"), { ...letter("A", 2), multiplier: "triple-letter" as const }, choice("Q", "K"), letter("T")];
    const words = testDictionary(["AT", "KA", "QAT"]);
    assert.deepEqual(chooseOfflineWord({ available, dictionary: words }), {
      plays: [{ tileId: "QK-1", chosenFace: "Q" }, { tileId: "A-2" }, { tileId: "T-1" }],
    });
  });
});

describe("offline smoke replay", () => {
  it("pins the real-dictionary hand used by the web and native smoke flows", async () => {
    const dictionary = await loadDictionary();
    let state = startHand({ seed: 20_260_919, players: SEATS, nowMs: NOW, dictionary });
    assert.deepEqual(decideOfflineMove(state, "mira"), { type: "raise", playerId: "mira", amount: 60 });
    while (!(state.phase === "river" && state.toActIndex === 0)) {
      const id = actingSeatId(state);
      const seat = state.seats[state.toActIndex ?? -1];
      const action = id === "hero"
        ? { type: (state.betting?.currentBet ?? 0) > (seat?.committedRound ?? 0) ? "call" as const : "check" as const, playerId: id }
        : decideOfflineMove(state, id);
      state = reduce(state, action, NOW);
    }
    assert.equal(state.seats.reduce((sum, seat) => sum + seat.committedHand, 0), 560);
    state = reduce(state, { type: "bet", playerId: "hero", amount: 20 }, NOW);
    const answer = decideOfflineMove(state, "mira");
    assert.deepEqual(answer, { type: "raise", playerId: "mira", amount: 420 });
    state = reduce(state, answer, NOW);
    state = reduce(state, { type: "call", playerId: "hero" }, NOW);
    assert.equal(state.wordWindow?.status, "open");
    assert.equal(state.seats.reduce((sum, seat) => sum + seat.committedHand, 0), 1_400);
  });

  it("replays whole sessions across rotating blinds and short stacks", async () => {
    const dictionary = await loadDictionary();
    function play(seed: number) {
      let state = startHand({ seed, players: SEATS, nowMs: NOW, dictionary });
      const trace: OfflineAction[] = [];
      for (let moves = 0; moves < 1_200; moves += 1) {
        if (state.phase === "payout") {
          assert.equal(state.seats.reduce((sum, seat) => sum + seat.stack, 0), 4_000);
          if (state.sessionOver || state.hand === 8) return { state, trace };
          const deal = { type: "deal" } as const;
          trace.push(deal);
          state = reduce(state, deal, NOW);
        } else if (state.wordWindow?.status === "open") {
          // Clock expiry is enough here: best-word submission is exercised in the hand walk.
          const timeout = { type: "timeoutWords" } as const;
          trace.push(timeout);
          state = reduce(state, timeout, state.endsAtMs);
        } else {
          const action = decideOfflineMove(state, actingSeatId(state));
          trace.push(action);
          state = reduce(state, action, NOW);
        }
      }
      assert.fail("session did not progress");
    }
    for (const seed of [810, 811, 812]) assert.deepEqual(play(seed), play(seed));
  });
});
