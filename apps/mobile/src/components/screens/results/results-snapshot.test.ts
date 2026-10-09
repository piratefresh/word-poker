import {
  DEFAULT_STAKES,
  availableTiles,
  bettingBounds,
  chooseOfflineWord,
  evaluateWord,
  handSeed,
  reduce,
  scoreWord,
  startHand,
  type Dictionary,
  type OfflineState,
} from "@wordpoker/game-rules";

import { testDictionary } from "@/test-support/dictionary-fixtures";

import { buildResultsSnapshot } from "./results-snapshot";
import type { ResultsSeat } from "./results-types";

const SEED = 7;
const HERO = "hero";
const SEATS = [HERO, "ellis", "jay", "mira"] as const;

/** The felt's side of the mapper, as the offline adapter maps it: dense, in seat order. */
function playersOf(state: OfflineState) {
  return state.seats.map((seat, index) => ({
    id: seat.id,
    name: ["Guest", "Ellis", "Jay", "Mira"][index] ?? seat.id,
    initials: ["GU", "EL", "JA", "MI"][index] ?? seat.id.slice(0, 2).toUpperCase(),
    stack: seat.stack,
    color: "#e6b450",
    status: "waiting" as const,
    ...(seat.id === HERO ? { isHero: true } : {}),
  }));
}

/**
 * One whole hand played by the engine alone — every seat checks or calls to reach showdown,
 * §19's window confirmed with the word each seat can actually build and then run out — so a
 * test can hold the settled state and the snapshot built from it side by side.
 */
function playOutHand(dictionary: Dictionary): OfflineState {
  let state = startHand({ seed: SEED, players: SEATS, nowMs: 0, dictionary, stakes: DEFAULT_STAKES });

  for (let step = 0; step < 400 && state.phase !== "payout"; step += 1) {
    const window = state.wordWindow;

    if (window?.status === "open") {
      for (const slot of window.slots) {
        if (slot.status !== "drafting") continue;
        const submission = chooseOfflineWord({
          available: availableTiles(state, slot.seat),
          dictionary,
        });
        if (submission !== null) {
          state = reduce(state, { type: "confirmWord", playerId: slot.playerId, submission }, 0);
        }
      }
      // The clock is what closes a window nobody finished: only legal at or after the deadline.
      state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
      continue;
    }

    const acting = state.toActIndex === null ? undefined : state.seats[state.toActIndex];
    if (acting === undefined) break;
    if (state.betting === null || state.toActIndex === null) break;
    const bounds = bettingBounds(state.seats, state.betting, state.toActIndex, state.stakes.bigBlind);
    if (bounds === null) break;
    state = reduce(
      state,
      bounds.canCheck ? { type: "check", playerId: acting.id } : { type: "call", playerId: acting.id },
      0,
    );
  }

  return state;
}

/** Every seat but one folds, in turn order: §26's fold-out, settled in the fold that left one. */
function playToFoldOut(dictionary: Dictionary, survivor: string): OfflineState {
  let state = startHand({ seed: SEED, players: SEATS, nowMs: 0, dictionary, stakes: DEFAULT_STAKES });

  for (let step = 0; step < 40 && state.phase !== "payout"; step += 1) {
    const index = state.toActIndex;
    if (index === null || state.betting === null) break;
    const acting = state.seats[index];
    if (acting === undefined) break;

    if (acting.id === survivor) {
      const bounds = bettingBounds(state.seats, state.betting, index, state.stakes.bigBlind);
      if (bounds === null) break;
      state = reduce(
        state,
        bounds.canCheck ? { type: "check", playerId: acting.id } : { type: "call", playerId: acting.id },
        0,
      );
      continue;
    }

    state = reduce(state, { type: "fold", playerId: acting.id }, 0);
  }

  return state;
}

describe("buildResultsSnapshot", () => {
  /**
   * A table whose word list holds only a two-letter word nobody can spell from their deal:
   * every seat runs out of time, so the hand pays out with four cards at 0 — the §11 edge the
   * scoreboard has to render rather than a hand where every number happens to be interesting.
   */
  test("carries the engine's own numbers, per seat and in the ladder's order", () => {
    const dictionary = testDictionary(["ZZ"]);
    const state = playOutHand(dictionary);
    const snapshot = buildResultsSnapshot({ state, players: playersOf(state) });
    if (snapshot === null) throw new Error("the hand never paid out");

    expect(snapshot.hand).toBe(1);
    expect(snapshot.seed).toBe(handSeed(state));
    expect(snapshot.revealed).toBe(true);
    expect(snapshot.table).toEqual({ players: 4, folded: 0 });

    // The order is §21's, seat for seat, and the pot is §25's layers added up.
    expect(snapshot.seats.map((seat) => seat.playerId)).toEqual(
      state.result?.standings.map((standing) => standing.playerId),
    );
    expect(snapshot.pot).toBe(
      state.result?.payout.pots.reduce((total, pot) => total + pot.amount, 0),
    );

    for (const seat of snapshot.seats) {
      const standing = state.result?.standings.find((candidate) => candidate.playerId === seat.playerId);
      expect(seat.total).toBe(standing?.score);
      expect(seat.place).toBe(standing?.place);
      expect(seat.takesPot).toBe(standing?.place === 1);
      expect(seat.base + seat.mult + seat.rack).toBe(seat.total);
      expect(seat.reason).toBe(standing?.reason);
      expect(seat.decidedBy).toBe(standing?.decidedBy);
    }
  });

  test("renders a seat that played nothing as a card at 0 with §11's reason", () => {
    const state = playOutHand(testDictionary(["ZZ"]));
    const snapshot = buildResultsSnapshot({ state, players: playersOf(state) });
    if (snapshot === null) throw new Error("the hand never paid out");

    expect(snapshot.seats).toHaveLength(4);
    for (const seat of snapshot.seats) {
      expect(seat.word).toBeNull();
      expect(seat.tiles).toEqual([]);
      expect(seat.total).toBe(0);
      expect(seat.reason).toBe("timer-expired");
    }
    expect(snapshot.summary).toBe("4 PLAYERS · 0 FOLDS · 0 WORDS PLAYED");
    expect(snapshot.headline.subline).toContain("NO WORD");
  });

  test("splits §7's score into the three numbers the card prints, word for word", () => {
    // The hero's own deal, played as its word: the snapshot's breakdown has to be the same
    // arithmetic `scoreWord` does on the same submission, tile for tile and letter for letter.
    const dictionaryForDeal = testDictionary(["ZZ"]);
    const deal = startHand({
      seed: SEED,
      players: SEATS,
      nowMs: 0,
      dictionary: dictionaryForDeal,
      stakes: DEFAULT_STAKES,
    });
    const available = availableTiles(deal, 0);
    const spelled = available
      .slice(0, 2)
      .map((tile) => tile.letter)
      .join("");
    const dictionary = testDictionary([spelled]);
    const state = playOutHand(dictionary);
    const snapshot = buildResultsSnapshot({ state, players: playersOf(state) });
    if (snapshot === null) throw new Error("the hand never paid out");

    const hero = snapshot.seats.find((seat) => seat.isYou);
    if (hero === undefined) throw new Error("the hero has no card");
    expect(hero.name).toBe("Guest");

    // What the hero actually submitted this hand, re-resolved against the seat's own tiles.
    const slot = state.wordWindow?.slots.find((candidate) => candidate.seat === 0);
    if (slot?.status !== "confirmed") throw new Error("the hero never confirmed a word");
    const evaluation = evaluateWord({
      available: availableTiles(state, 0),
      submission: slot.submission,
      dictionary,
    });
    if (!evaluation.valid) throw new Error("the hero's word was refused");
    const score = scoreWord(evaluation.tiles);

    expect(hero.word).toBe(evaluation.word);
    expect(hero.base).toBe(score.letters.reduce((total, letter) => total + letter.baseValue, 0));
    expect(hero.mult).toBe(
      score.letters.reduce((total, letter) => total + (letter.value - letter.baseValue), 0),
    );
    expect(hero.rack).toBe(score.fullRackBonus);
    expect(hero.total).toBe(score.total);
    expect(hero.tiles.map((tile) => tile.id)).toEqual(evaluation.tiles.map((played) => played.tileId));
  });

  test("renders the fold-out winner first, followed by every folded player", () => {
    const state = playToFoldOut(testDictionary(["ZZ"]), "ellis");
    expect(state.result?.standings).toHaveLength(0);

    const snapshot = buildResultsSnapshot({ state, players: playersOf(state) });
    if (snapshot === null) throw new Error("the fold-out never settled");

    expect(snapshot.revealed).toBe(false);
    expect(snapshot.seats).toHaveLength(4);
    expect(snapshot.seats.slice(1).map((seat) => seat.playerId)).toEqual([HERO, "jay", "mira"]);
    expect(snapshot.seats.slice(1).every((seat) => seat.folded && !seat.takesPot)).toBe(true);
    expect(snapshot.seats[0]?.folded).toBe(false);
    expect(snapshot.seats[0]?.name).toBe("Ellis");
    expect(snapshot.seats[0]?.word).toBeNull();
    expect(snapshot.seats[0]?.tiles).toEqual([]);
    expect(snapshot.seats[0]?.total).toBe(0);
    expect(snapshot.seats[0]?.takesPot).toBe(true);
    expect(snapshot.seats[0]?.decidedBy).toBeNull();

    expect(snapshot.table).toEqual({ players: 4, folded: 3 });
    expect(snapshot.headline.lead).toBe("Ellis takes");
    expect(snapshot.headline.emphasis).toBe("the pot");
    expect(snapshot.headline.subline).toBe("ELLIS · EVERYONE FOLDED");
    expect(snapshot.summary).toBe("4 PLAYERS · 3 FOLDS · 0 WORDS PLAYED");
    const bare = buildResultsSnapshot({ state, players: [] });
    expect(bare?.seats.map((seat) => seat.playerId)).toEqual(["ellis", HERO, "jay", "mira"]);
  });

  test("keeps the seats' identity as the felt draws it, and falls back when it has none", () => {
    const state = playOutHand(testDictionary(["ZZ"]));

    const named = buildResultsSnapshot({ state, players: playersOf(state) });
    const hero = named?.seats.find((seat) => seat.isYou);
    expect(hero?.initials).toBe("GU");
    expect(hero?.color).toBe("#e6b450");

    // No roster at all: the payload still renders, off the ids the engine carries, and still in
    // the ladder's order rather than the table's.
    const bare = buildResultsSnapshot({ state, players: [] });
    const cards: readonly ResultsSeat[] = bare?.seats ?? [];
    expect(cards.map((seat) => seat.name)).toEqual(
      state.result?.standings.map((standing) => standing.playerId),
    );
    expect(cards.every((seat) => seat.isYou === false)).toBe(true);
    expect(cards.every((seat) => seat.initials.length > 0)).toBe(true);
  });

  test("has no snapshot while no hand has paid out", () => {
    const state = startHand({
      seed: SEED,
      players: SEATS,
      nowMs: 0,
      dictionary: testDictionary(["ZZ"]),
      stakes: DEFAULT_STAKES,
    });

    expect(buildResultsSnapshot({ state, players: playersOf(state) })).toBeNull();
  });
});
