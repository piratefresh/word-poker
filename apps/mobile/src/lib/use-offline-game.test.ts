import { act, renderHook } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { LETTER_VALUES, WORD_WINDOW_MS, dealHand, type Letter } from "@wordpoker/game-rules";

import { testDictionary } from "./dictionary-fixtures";
import { useOfflineGame, type OfflineGame } from "./use-offline-game";

const SEED = 7;
/** A seed whose first bot bets: the hero starts preflop facing a call. */
const BETTING_SEED = 20_260_919;
const SEATS = 4;

/** The hero's live result, as `renderHook` hands it over. */
type Table = { current: OfflineGame };

/** The hero's own two tiles, as the deal will give them for this seed. */
function heroTiles(seed = SEED): readonly Tile[] {
  return dealHand({ seed, playerCount: SEATS }).privateTiles[0] ?? [];
}

/** The face a play names: a choice tile picks one of its faces, the others play themselves. */
function playOf(tile: Tile): { tileId: string; chosenFace?: string } {
  return "alternativeLetter" in tile
    ? { tileId: tile.id, chosenFace: tile.letter }
    : { tileId: tile.id };
}

/** The word a list of the hero's tiles spells (§10): a sequence tile prints both letters. */
function spells(tiles: readonly Tile[]): string {
  return tiles
    .map((tile) => ("sequenceLetter" in tile ? `${tile.letter}${tile.sequenceLetter}` : tile.letter))
    .join("");
}

/** The hero's own two tiles, as the deal will give them for this seed, spelled as one word. */
function heroWord(seed = SEED): string {
  return spells(heroTiles(seed));
}

/**
 * §7 in the test's own arithmetic: every letter at its §6 value, doubled or tripled by the
 * multiplier on the tile that prints it. Derived from the tiles rather than from the engine's
 * scoring, so it is a second opinion.
 */
function expectedScore(tiles: readonly Tile[]): number {
  const total = tiles.reduce((sum, tile) => {
    const factor = tile.multiplier === "triple-letter" ? 3 : tile.multiplier === "double-letter" ? 2 : 1;
    const faces = "sequenceLetter" in tile ? [tile.points, tile.sequencePoints] : [tile.points];
    return sum + faces.reduce((letters, points) => letters + points * factor, 0);
  }, 0);

  // §7.3's rack bonus: every one of the seven physical tiles, and none of the two here.
  return total + (tiles.length === 7 ? 10 : 0);
}

/**
 * The table under test, with the dictionary reading exactly the word the hero's tiles spell —
 * so the hero's own word is the one the test can reason about, and the fixture is the same
 * length as the hand.
 */
async function table(seed = SEED): Promise<Table> {
  const dictionary = testDictionary([heroWord(seed)]);
  const { result } = await renderHook(() => useOfflineGame({ seed, dictionary }));
  return result as Table;
}

/** The hero's row, as the felt reads it. */
function row(result: Table) {
  return result.current.game.betting;
}

/** Takes the hero's turn the way the row offers it: check when nothing is owed, else call. */
async function takeTurn(result: Table) {
  await act(async () => {
    if (row(result).canCheck) result.current.check();
    else result.current.call();
  });
}

/** Taps the row until §19's window opens — the bots answer inside each tap. */
async function playToWindow(result: Table) {
  for (let step = 0; step < 40 && !result.current.words?.confirmable; step += 1) {
    await takeTurn(result);
  }
  expect(result.current.words?.confirmable).toBe(true);
}

/** The hero plays both of its tiles, in order, and confirms the word they spell. */
async function buildHeroWord(result: Table) {
  await act(async () => {
    result.current.setDraft(heroTiles().map(playOf));
  });

  await act(async () => {
    result.current.confirmWord();
  });
}

/**
 * §19's window closes with the clock run out — how a window ends while a seat that has nothing
 * to confirm is still drafting. The hook's own timer is what settles it, so this needs fake
 * timers.
 */
async function runWindowClockOut() {
  await act(async () => {
    jest.advanceTimersByTime(WORD_WINDOW_MS + 100);
  });
}

describe("useOfflineGame — the dealt table", () => {
  test("deals a hand the felt can render as it stands, with the row armed off the engine", async () => {
    const result = await table();

    expect(result.current.game).toMatchObject({
      phase: "preflop",
      phaseNumber: 2,
      seatCount: 4,
      pot: 0,
      sidePots: [],
      sessionOver: false,
      secondsRemaining: 30,
    });
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    expect(result.current.game.privateTiles).toHaveLength(2);
    expect(result.current.game.players).toHaveLength(4);
    expect(result.current.game.players.map((player) => player?.status)).toEqual([
      "your-turn",
      "waiting",
      "waiting",
      "waiting",
    ]);
    // The button is seat 0's on the first hand, and no blinds exist to badge (ADR 0001).
    expect(result.current.game.players.map((player) => player?.role)).toEqual([
      "dealer",
      undefined,
      undefined,
      undefined,
    ]);
    // The felt badges this seat "· YOU" and the HUD names it when it announces the turn,
    // so exactly one seat — the hero's — has to carry the flag.
    expect(
      result.current.game.players.filter((player) => player?.isHero).map((player) => player?.id),
    ).toEqual(["hero"]);

    // The row is the engine's own bounds: nothing is owed, the opening bet is open, and the
    // slider is bounded by the minimum bet and the hero's stack.
    expect(row(result)).toEqual({
      minRaise: 20,
      maxRaise: 1_000,
      raiseStep: 20,
      raiseAmount: 20,
      canFold: true,
      canCheck: true,
      canRaise: false,
      canBet: true,
      canAllIn: true,
      allInAmount: 1_000,
      currentBet: 0,
    });

    // The builder runs the whole hand, so the draft is ready from the deal: empty, open to
    // build, but not confirmable until §19's window opens after the river.
    expect(result.current.words).toMatchObject({
      plays: [],
      word: "",
      open: true,
      confirmable: false,
    });
  });

  test("keeps the unrevealed board slots null and fills them down the streets", async () => {
    const result = await table();

    const revealed = () => result.current.game.community.filter((tile) => tile !== null).length;

    for (const [street, count] of [3, 4, 5].entries()) {
      for (let step = 0; step < 30 && revealed() < count; step += 1) await takeTurn(result);

      expect(revealed()).toBe(count);
      expect(result.current.game.community.slice(count)).toEqual(Array(5 - count).fill(null));
      expect(result.current.game.phaseNumber).toBe(3 + street);

      // The bots take their turns inside the tap, so the table is back on the hero.
      expect(result.current.game.players[0]?.status).toBe("your-turn");
    }
  });

  test("opens a fresh turn per action, so the HUD's countdown re-anchors", async () => {
    const result = await table();
    const first = result.current.game.id;

    await takeTurn(result);

    expect(result.current.game.id).not.toBe(first);
  });

  test("opens §19's word window after the river, with the hero's draft ready", async () => {
    const result = await table();

    await playToWindow(result);

    // The window is the table's, not a seat's: nobody is to act, and the HUD counts its
    // sixty seconds rather than a turn's thirty.
    expect(result.current.game.phase).toBe("river");
    expect(result.current.game.secondsRemaining).toBe(60);
    expect(row(result).canFold).toBe(false);

    // The draft was open all hand; the window is what now makes it confirmable.
    expect(result.current.words).toMatchObject({
      plays: [],
      word: "",
      reason: null,
      confirmed: false,
      open: true,
      confirmable: true,
    });
  });

  test("reads the pot off the seats' commitments as the chips come in", async () => {
    const betting = await table(BETTING_SEED);

    // mira opened the hand for 60, so the hero owes a call that the row states exactly.
    expect(row(betting).canCheck).toBe(false);
    expect(row(betting).callAmount).toBe(60);
    expect(row(betting).canBet).toBe(false);
    expect(row(betting).canRaise).toBe(true);
    // The raise floor is the current bet plus the last raise's increment.
    expect(row(betting).minRaise).toBe(120);
    // Only mira's bet is in so far: the hero has not paid the call it owes.
    expect(betting.current.game.pot).toBe(60);
    expect(betting.current.game.players.map((player) => player?.bet ?? 0)).toEqual([0, 0, 0, 60]);

    await takeTurn(betting);

    // The hero matched, and so did the seats behind it: the pot carries every call.
    expect(betting.current.game.pot).toBeGreaterThanOrEqual(240);
  });

  test("plays the same hand twice for the same seed, and a different one for another", async () => {
    const first = await table();
    await takeTurn(first);

    const replay = await table();
    await takeTurn(replay);
    expect(replay.current.game.community).toEqual(first.current.game.community);

    const other = await table(SEED + 1);
    expect(other.current.game.privateTiles).not.toEqual(first.current.game.privateTiles);
  });
});

describe("useOfflineGame — the hero's clocks", () => {
  test("checks on the deadline when checking is free", async () => {
    jest.useFakeTimers();

    const result = await table();
    expect(row(result).canCheck).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(30_100);
    });

    // The auto-check completed the preflop round and the bots answered: the table is on the
    // flop with the hero's commitment untouched.
    expect(result.current.game.phase).toBe("flop");
    expect(result.current.game.players[0]?.status).toBe("your-turn");
    expect(result.current.game.pot).toBe(0);

    jest.useRealTimers();
  });

  test("folds on the deadline when a bet is owed", async () => {
    jest.useFakeTimers();

    const result = await table(BETTING_SEED);
    expect(row(result).canCheck).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(30_100);
    });

    // The hero gave the hand up rather than paying the call; a folded seat builds no word.
    expect(result.current.game.players[0]?.status).toBe("fold");
    expect(result.current.words).toBeNull();
    expect(result.current.game.players[0]?.stack).toBe(1_000);

    jest.useRealTimers();
  });
});

describe("useOfflineGame — §19's window", () => {
  test("builds the hero's word from its own tiles, and pays out on the confirmation", async () => {
    jest.useFakeTimers();

    const result = await table();
    await playToWindow(result);

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.setDraft(plays.slice(0, 1));
    });

    // One edit is one submission, and the word is the letters those tiles print — including a
    // draft of one tile, which §12 will not call a word yet.
    expect(result.current.words?.plays).toHaveLength(1);
    expect(result.current.words?.word).toBe(spells(heroTiles().slice(0, 1)));
    expect(result.current.words?.open).toBe(true);

    await act(async () => {
      result.current.setDraft(plays);
    });
    expect(result.current.words?.word).toBe(heroWord());

    await act(async () => {
      result.current.confirmWord();
    });

    // The hero's word is the table's to judge now, and §19 locks it.
    expect(result.current.words?.confirmed).toBe(true);
    expect(result.current.game.phase).toBe("river");

    // A bot whose tiles spell nothing the table counts never confirms, so the window ends the
    // way §19 says it does: with the clock. Only then does the hand pay out on the real judging.
    await runWindowClockOut();

    expect(result.current.game.phase).toBe("payout");
    expect(result.current.game.bestScore).toBeGreaterThanOrEqual(expectedScore(heroTiles()));
    // The winner's own word is what the felt's reveal line shows.
    expect(result.current.game.bestWord).toBe(heroWord());
    expect(result.current.game.players.filter((player) => player?.status === "winner")).toHaveLength(1);

    // The pot is a real one now, and it landed in the winner's stack: every chip still on the
    // table.
    expect(result.current.game.pot).toBeGreaterThan(0);
    expect(
      result.current.game.players.reduce((total, player) => total + (player?.stack ?? 0), 0),
    ).toBe(4_000);

    jest.useRealTimers();
  });

  test("refuses a draft the tiles cannot build, and keeps the draft it had", async () => {
    const result = await table();

    const [first] = heroTiles().map(playOf);
    await act(async () => {
      result.current.setDraft([first ?? { tileId: "" }]);
    });
    // §11: a physical tile is played once. The engine refuses a draft that plays it twice, and
    // the draft is left exactly as it was, with the reason on screen.
    await act(async () => {
      result.current.setDraft([first ?? { tileId: "" }, first ?? { tileId: "" }]);
    });

    expect(result.current.words?.plays).toHaveLength(1);
    expect(result.current.words?.reason).toBe("tile-reused");
  });

  test("takes a tile back out of the draft, and clears the draft the hero wants to start over", async () => {
    const result = await table();

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.setDraft(plays);
    });
    await act(async () => {
      result.current.setDraft(plays.slice(1));
    });
    expect(result.current.words?.plays).toEqual([plays[1]]);

    await act(async () => {
      result.current.setDraft([]);
    });
    expect(result.current.words).toMatchObject({ plays: [], word: "" });
  });

  test("previews what §7 makes the draft worth, bonus included at the whole rack", async () => {
    const result = await table();
    await playToWindow(result);

    // Nothing played is nothing to score: the builder shows a word, not a number, until there
    // are letters behind it.
    expect(result.current.words?.score).toBeNull();

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.setDraft(plays.slice(0, 1));
    });
    // §12: one tile is a letter, not a word, so there is still nothing to score.
    expect(result.current.words?.word).toHaveLength(spells(heroTiles().slice(0, 1)).length);
    expect(result.current.words?.score).toBeNull();

    await act(async () => {
      result.current.setDraft(plays);
    });
    expect(result.current.words?.score).toMatchObject({
      letterScore: expectedScore(heroTiles()),
      fullRackBonus: 0,
      total: expectedScore(heroTiles()),
    });

    // The board's tiles are the seat's to play too, so all seven are reachable — and the
    // preview earns §7.3's bonus exactly when they are all in the word.
    const board = result.current.game.community.filter((tile) => tile !== null);
    await act(async () => {
      result.current.setDraft([...plays, ...board.map(playOf)]);
    });

    // `expectedScore` is the test's own §7, rack bonus included, so this is a second opinion
    // on the whole number rather than on the parts of it the engine reports.
    expect(result.current.words?.plays).toHaveLength(7);
    expect(result.current.words?.score).toMatchObject({
      fullRackBonus: 10,
      total: expectedScore([...heroTiles(), ...board]),
    });
  });

  test("reads the word off the order the draft holds, whatever order it was built in", async () => {
    const result = await table();
    await playToWindow(result);

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.setDraft(plays);
    });
    const before = result.current.words;
    expect(before?.word).toBe(heroWord());

    // The strip's order is the word's order, so a reorder arrives as the same tiles in the
    // other sequence: the letters read the other way and the score does not move.
    await act(async () => {
      result.current.setDraft([plays[1], plays[0]].filter((play) => play !== undefined));
    });

    expect(result.current.words?.word).toBe([...heroWord()].reverse().join(""));
    expect(result.current.words?.score?.total).toBe(before?.score?.total);
  });

  test("starts the next hand from the payout, on a fresh deal", async () => {
    jest.useFakeTimers();

    const result = await table();
    await playToWindow(result);
    await buildHeroWord(result);
    await runWindowClockOut();
    const finished = result.current.game.id;

    await act(async () => {
      result.current.deal();
    });

    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.id).not.toBe(finished);
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    expect(result.current.game.players[0]?.status).toBe("your-turn");
    // A fresh hand is a fresh, empty draft — open to build again, and cleared of the last one.
    expect(result.current.words).toMatchObject({ plays: [], word: "", open: true, confirmable: false });

    jest.useRealTimers();
  });

  test("keeps every letter of a word a multiplier tile prints at its §6 value", async () => {
    const tiles = heroTiles();
    const letters = tiles.map((tile) => LETTER_VALUES[tile.letter as Letter]);

    expect(expectedScore(tiles)).toBe(letters.reduce((sum, value) => sum + value, 0));
  });
});
