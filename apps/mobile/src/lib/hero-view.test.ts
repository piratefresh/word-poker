import { POWER_DRAW_MS, WORD_CHECKS_PER_HAND, type LetterTile, type Tile } from "@wordpoker/contracts";

import { testDictionary } from "./dictionary-fixtures";
import {
  feltControls,
  heroView,
  type HeroLocal,
  type HeroMoves,
  type HeroPerspective,
  type HeroSeat,
} from "./hero-view";

/** The hero's two tiles, spelling GO — the one word the fixture dictionary knows. */
const RACK: readonly Tile[] = [
  { id: "t-g", letter: "G", points: 2 } satisfies LetterTile,
  { id: "t-o", letter: "O", points: 1 } satisfies LetterTile,
];
const GO = [{ tileId: "t-g" }, { tileId: "t-o" }];

function seat(id: string, place: number, overrides: Partial<HeroSeat> = {}): HeroSeat {
  return {
    id,
    place,
    name: id,
    initials: id.slice(0, 2).toUpperCase(),
    color: "#000",
    stack: 500,
    committedRound: 0,
    committedHand: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    actedThisRound: false,
    ...overrides,
  };
}

/** A heads-up preflop with nothing bet, the hero first to act. */
function perspective(overrides: Partial<HeroPerspective> = {}): HeroPerspective {
  return {
    id: "turn-1",
    handId: "hand-1",
    flights: [],
    phase: "preflop",
    seatCount: 4,
    seats: [seat("hero", 0), seat("opp", 2)],
    heroIndex: 0,
    actingIndex: 0,
    dealerIndex: 1,
    heroToAct: true,
    round: { currentBet: 0, lastRaiseSize: 0 },
    blinds: { smallBlind: 5, bigBlind: 10 },
    community: [null, null, null, null, null],
    privateTiles: RACK,
    available: RACK,
    word: { open: false, hero: null, confirmedPlays: null },
    result: null,
    sidePots: [],
    sessionOver: false,
    dictionary: testDictionary(["GO"]),
    wordCheck: { checksRemaining: WORD_CHECKS_PER_HAND, result: null },
    ...overrides,
  };
}

const LOCAL: HeroLocal = { draft: [], refusal: null, pendingPill: null, pendingConfirm: false };

/** The river's close: betting is done and §19's window is open with the hero drafting. */
const WINDOW: Partial<HeroPerspective> = {
  phase: "river",
  heroToAct: false,
  actingIndex: null,
  round: null,
  word: { open: true, hero: "drafting", confirmedPlays: null },
};

describe("heroView — the felt", () => {
  test("places every seat by its felt place, leaving the empty places empty", () => {
    const { game } = heroView(perspective(), LOCAL);

    expect(game.players.map((player) => player?.id ?? null)).toEqual(["hero", null, "opp", null]);
    expect(game.players[0]).toMatchObject({ isHero: true, status: "your-turn" });
    // Heads-up here — two seats in the hand — so the button posts the small blind and the other
    // seat holds the big blind (§5).
    expect(game.players[2]).toMatchObject({ isHero: false, status: "waiting", roles: ["dealer", "small-blind"] });
    expect(game.players[0]?.roles).toEqual(["big-blind"]);
  });

  test("badges the button and the two seats clockwise from it (§5)", () => {
    const seats = [seat("hero", 0), seat("sb", 1), seat("bb", 2), seat("utg", 3)];
    const { game } = heroView(perspective({ seats, dealerIndex: 0 }), LOCAL);

    // Hand 1 at a four-seat table: the button is seat 0, the blinds are seats 1 and 2, and the
    // seat clockwise from the big blind holds no marker.
    expect(game.players.map((player) => player?.roles)).toEqual([
      ["dealer"],
      ["small-blind"],
      ["big-blind"],
      undefined,
    ]);
  });

  test("marks no blind for a seat that is sitting the hand out (§5, ADR 0002)", () => {
    const seats = [seat("hero", 0), seat("busted", 1, { sittingOut: true }), seat("sb", 2), seat("bb", 3)];
    const { game } = heroView(perspective({ seats, dealerIndex: 0 }), LOCAL);

    // The sitting-out seat is not dealt in, so the button's blinds pass over it.
    expect(game.players.map((player) => player?.roles)).toEqual([
      ["dealer"],
      undefined,
      ["small-blind"],
      ["big-blind"],
    ]);
  });

  test("reads the pot off every seat's commitment this hand", () => {
    const seats = [seat("hero", 0, { committedHand: 30 }), seat("opp", 2, { committedHand: 50, committedRound: 20 })];
    const { game } = heroView(perspective({ seats }), LOCAL);

    expect(game.pot).toBe(80);
    expect(game.players[2]?.bet).toBe(20);
  });

  test("pays the winner its pill before an all-in one, and names the winning word", () => {
    const seats = [seat("hero", 0, { allIn: true }), seat("opp", 2, { folded: true })];
    const { game, words } = heroView(
      perspective({
        phase: "payout",
        seats,
        result: { winner: "hero", standings: [{ playerId: "hero", score: 3, place: 1, word: "GO" }] },
      }),
      LOCAL,
    );

    expect(game.players[0]?.status).toBe("winner");
    expect(game.players[2]?.status).toBe("fold");
    expect(game.bestWord).toBe("GO");
    // There is no draft to build once the hand has paid out.
    expect(words).toBeNull();
  });

  test("shows no winning word for a top place that built none", () => {
    const { game } = heroView(
      perspective({
        phase: "payout",
        result: { winner: "hero", standings: [{ playerId: "hero", score: 0, place: 1, word: "" }] },
      }),
      LOCAL,
    );

    expect(game.bestWord).toBeUndefined();
  });
});

describe("heroView — the action row", () => {
  test("opens an unbet round with a bet, and checks rather than calls", () => {
    const { betting } = heroView(perspective(), LOCAL).game;

    expect(betting).toMatchObject({ canCheck: true, canBet: true, canRaise: false, primary: "check", wager: "bet" });
    expect(betting.callAmount).toBeUndefined();
  });

  test("answers a bet with a call and a raise, never a bet the engine refuses", () => {
    const seats = [seat("hero", 0), seat("opp", 2, { committedRound: 20, committedHand: 20, actedThisRound: true })];
    const { betting } = heroView(perspective({ seats, round: { currentBet: 20, lastRaiseSize: 20 } }), LOCAL).game;

    expect(betting).toMatchObject({ canCheck: false, canBet: false, canRaise: true, callAmount: 20 });
    expect(betting).toMatchObject({ primary: "call", wager: "raise", minRaise: 40 });
  });

  test("goes dark off the hero's turn", () => {
    const { betting } = heroView(perspective({ heroToAct: false, actingIndex: 1 }), LOCAL).game;

    expect(betting).toMatchObject({ canFold: false, canCheck: false, canBet: false, canAllIn: false });
  });

  test("holds the whole table while §44's Power Draw is open, on the draw's own clock", () => {
    const betting = heroView(perspective(), LOCAL).game;
    const drawing = heroView(perspective({ powerDraw: true }), LOCAL).game;

    // Pre-flop's first seat is the hero, but nobody is on the clock until the draw closes.
    expect(drawing.betting).toMatchObject({ canFold: false, canCheck: false, canBet: false, canAllIn: false });
    expect(drawing.players[0]?.status).toBe("waiting");
    expect(drawing.secondsRemaining).toBe(POWER_DRAW_MS / 1_000);
    // A turn of its own, so the HUD restarts its countdown on the betting clock when it closes.
    expect(drawing.id).not.toBe(betting.id);
  });

  test("goes dark at once while the hero's move is on the wire, and wears its pill", () => {
    const { game } = heroView(perspective(), { ...LOCAL, pendingPill: "check" });

    expect(game.betting).toMatchObject({ canFold: false, canCheck: false, canBet: false });
    expect(game.players[0]?.status).toBe("check");
  });

  test("turns the check into the confirm inside §19's window once there is a draft", () => {
    expect(heroView(perspective(WINDOW), LOCAL).game.betting).toMatchObject({ canCheck: false, primary: "call" });
    expect(heroView(perspective(WINDOW), { ...LOCAL, draft: GO }).game.betting).toMatchObject({
      canCheck: true,
      primary: "confirm",
    });
  });

  test("disarms the confirm while a confirmation is on the wire", () => {
    const { betting } = heroView(perspective(WINDOW), { ...LOCAL, draft: GO, pendingConfirm: true }).game;

    expect(betting).toMatchObject({ canCheck: false, primary: "call" });
  });
});

describe("heroView — the word", () => {
  test("previews the draft the whole hand, confirmable only inside §19's window", () => {
    const before = heroView(perspective(), { ...LOCAL, draft: GO }).words;
    const inside = heroView(perspective(WINDOW), { ...LOCAL, draft: GO }).words;

    expect(before).toMatchObject({ word: "GO", score: { total: 3 }, reason: null, open: true, confirmable: false });
    expect(inside).toMatchObject({ word: "GO", confirmable: true });
  });

  test("calls a one-letter draft a word in progress, and a real miss a miss", () => {
    const partial = heroView(perspective(), { ...LOCAL, draft: [{ tileId: "t-g" }] }).words;
    const reversed = heroView(perspective(), { ...LOCAL, draft: [{ tileId: "t-o" }, { tileId: "t-g" }] }).words;

    expect(partial?.reason).toBeNull();
    expect(reversed?.reason).toBe("not-in-dictionary");
  });

  test("shows the engine's locked word once confirmed, whatever the device still holds", () => {
    const { words } = heroView(
      perspective({ ...WINDOW, word: { open: true, hero: "confirmed", confirmedPlays: GO } }),
      { ...LOCAL, draft: [{ tileId: "t-g" }] },
    );

    expect(words).toMatchObject({ plays: GO, word: "GO", confirmed: true, open: false, confirmable: false });
  });

  test("builds no word for a folded hero", () => {
    const seats = [seat("hero", 0, { folded: true }), seat("opp", 2)];

    expect(heroView(perspective({ seats }), LOCAL).words).toBeNull();
  });
});

describe("feltControls", () => {
  function moves(): HeroMoves & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      confirm: () => calls.push("confirm"),
      check: () => calls.push("check"),
      call: () => calls.push("call"),
      bet: (amount) => calls.push(`bet ${amount}`),
      raiseTo: (amount) => calls.push(`raise ${amount}`),
    };
  }

  test("binds each control to the move its label names", () => {
    const m = moves();
    feltControls({ primary: "confirm", wager: "bet" }, m).primary();
    feltControls({ primary: "check", wager: "bet" }, m).wager(20);
    feltControls({ primary: "call", wager: "raise" }, m).primary();
    feltControls({ primary: "call", wager: "raise" }, m).wager(40);

    expect(m.calls).toEqual(["confirm", "bet 20", "call", "raise 40"]);
  });

  test("falls back to the inert row while there is no hand", () => {
    const m = moves();
    feltControls(null, m).primary();

    expect(m.calls).toEqual(["call"]);
  });
});
