import { act, renderHook } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { LETTER_VALUES, WORD_WINDOW_MS, dealHand, type Letter } from "@wordpoker/game-rules";

import { duration } from "@/constants/theme";
import type { GamePlayer } from "@/components/screens/game/game-types";

import { testDictionary } from "./dictionary-fixtures";
import { useOfflineGame, type OfflineGame } from "./use-offline-game";

// The adapter reaches the HUD for the phase numbers, and the HUD's loop gate asks the router
// whether its screen is on top. expo-router reaches a navigation package Jest cannot parse, so
// the one hook is all this suite needs to answer: with nothing to run, the gate keeps its
// focused default and the loops are enabled, which is what a table in front of the seat is.
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));

const SEED = 7;
/** A seed whose first bot raises: the hero starts preflop facing a raise over the big blind. */
const BETTING_SEED = 20_260_919;
const SEATS = 4;

/** The offline table's blinds (§5, ADR 0004), and what the deal posts before it deals. */
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const BLINDS_POSTED = SMALL_BLIND + BIG_BLIND;

/**
 * The CPU plays on a beat of its own, and this is the whole of it: a table test owns the clock
 * (every test here runs on fake timers), and `passedToTheHero` is what advances the table to its
 * next decision.
 */
const BEAT_MS = duration.cpuBeat;

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

/** Lets the CPU take its next turn — one seat's move per beat, as the table plays it. */
async function beat() {
  await act(async () => {
    jest.advanceTimersByTime(BEAT_MS);
  });
}

/**
 * Whether the table is back on the seat: the hero's row is armed for a turn of its own, §19's
 * window is open on the hero's slot, or the hand has paid out.
 */
function waitsOnTheHero(result: Table): boolean {
  const { betting, phase } = result.current.game;
  return (
    phase === "payout" ||
    betting.canFold ||
    betting.canCheck ||
    result.current.words?.confirmable === true
  );
}

/** Runs the CPU's turns, one beat at a time, until the table is the hero's to move again. */
async function passedToTheHero(result: Table) {
  for (let step = 0; step < 40 && !waitsOnTheHero(result); step += 1) {
    await beat();
  }
}

/**
 * Takes the hero's turn the way the row offers it — check when nothing is owed, else call — and
 * lets the CPU answer it. The table is back on the hero when this returns, or at §19's window.
 */
async function takeTurn(result: Table) {
  await passedToTheHero(result);
  await act(async () => {
    if (row(result).canCheck) result.current.check();
    else result.current.call();
  });
  await passedToTheHero(result);
}

/** Taps the row until §19's window opens — the bots answer on the beats between the taps. */
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
 * to confirm is still drafting. The window's own timer is what settles it, so the test runs the
 * table's clock out a beat at a time: a clock that is stepped over does not paint what it passed.
 */
async function runWindowClockOut(result: Table) {
  const deadline = Math.ceil((WORD_WINDOW_MS + 100) / BEAT_MS);
  for (let step = 0; step < deadline && result.current.game.phase !== "payout"; step += 1) {
    await beat();
  }
  expect(result.current.game.phase).toBe("payout");
}

// The CPU answers on a timer, so every table here runs on the same clock the app does: fake
// timers, advanced a beat at a time. A test that needs the table to have moved asks for it.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useOfflineGame — the dealt table", () => {
  test("deals a hand the felt can render as it stands, with the row armed off the engine", async () => {
    const result = await table();

    // The deal leaves the first turn to a bot, so the first frame is the table sitting on that
    // seat's turn: the hero's row is dark and the seat itself says it is thinking.
    expect(result.current.game).toMatchObject({
      phase: "preflop",
      phaseNumber: 2,
      seatCount: 4,
      // The blinds are posted before the deal (§5, §14): the small blind's 10 and the big
      // blind's 20 are already in the middle.
      pot: 30,
      sidePots: [],
      sessionOver: false,
      secondsRemaining: 60,
    });
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    expect(result.current.game.privateTiles).toHaveLength(2);
    expect(result.current.game.players).toHaveLength(4);
    // The blind seats have posted and nobody else has acted, so the table is on mira — the first
    // dealt-in seat clockwise from the big blind (§15).
    expect(result.current.game.players.map((player) => player?.status)).toEqual([
      "waiting",
      "waiting",
      "waiting",
      "thinking",
    ]);
    // The button is seat 0's, and the blinds ride on it (§5): ellis holds the small blind, jay the
    // big blind.
    expect(result.current.game.players.map((player) => player?.roles)).toEqual([
      ["dealer"],
      ["small-blind"],
      ["big-blind"],
      undefined,
    ]);
    // And the posts read on the felt as the seats' own chips.
    expect(result.current.game.players.map((player) => player?.bet)).toEqual([
      undefined,
      10,
      20,
      undefined,
    ]);
    // The felt badges this seat "· YOU" and the HUD names it when it announces the turn,
    // so exactly one seat — the hero's — has to carry the flag.
    expect(
      result.current.game.players.filter((player) => player?.isHero).map((player) => player?.id),
    ).toEqual(["hero"]);

    // The builder runs the whole hand, so the draft is ready from the deal: empty, open to
    // build, but not confirmable until §19's window opens after the river.
    expect(result.current.words).toMatchObject({
      plays: [],
      word: "",
      open: true,
      confirmable: false,
    });

    await passedToTheHero(result);

    // mira called the big blind on its own beat, so the row the engine armed for the hero is the
    // engine's own bounds: the blind is owed, the opening bet is closed to it (the blind is
    // already out), and the slider runs from the raise floor to the hero's stack.
    expect(row(result)).toEqual({
      minRaise: 40,
      maxRaise: 1_000,
      raiseStep: 20,
      raiseAmount: 40,
      canFold: true,
      canCheck: false,
      callAmount: 20,
      canRaise: true,
      canBet: false,
      canAllIn: true,
      allInAmount: 1_000,
      currentBet: 20,
      primary: "call",
      wager: "raise",
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

      // The bots take their turns on their own beats, so the tap plus the beats it starts are
      // the street, and the table is back on the hero.
      expect(result.current.game.players[0]?.status).toBe("your-turn");
    }
  });

  test("opens a fresh turn per action, so the HUD's countdown re-anchors", async () => {
    const result = await table();
    await passedToTheHero(result);
    const heroTurn = result.current.game.id;

    await takeTurn(result);

    // The turn moved — the HUD re-anchors on that — and it moved on the hero's own action.
    expect(result.current.game.id).not.toBe(heroTurn);
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
    await passedToTheHero(betting);

    // mira raised the blind to 40 on its beat, so the hero owes the difference the row states.
    expect(row(betting).canCheck).toBe(false);
    expect(row(betting).callAmount).toBe(40);
    expect(row(betting).canBet).toBe(false);
    expect(row(betting).canRaise).toBe(true);
    // The raise floor is the current bet plus the last raise's increment.
    expect(row(betting).minRaise).toBe(60);
    // The blinds and mira's raise are in the middle; the hero has not paid the call it owes.
    expect(betting.current.game.pot).toBe(70);
    expect(betting.current.game.players.map((player) => player?.bet ?? 0)).toEqual([0, 10, 20, 40]);

    await takeTurn(betting);

    // The hero matched and the seats behind it called the raise, and the flop's own betting is
    // under way by the time the table is back on the hero: pre-flop's 160, plus jay's 40 and
    // mira's call of it.
    expect(betting.current.game.pot).toBe(240);
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
  test("folds on the deadline when the blind is owed", async () => {
    const result = await table();
    await passedToTheHero(result);
    expect(row(result).canCheck).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(60_100);
    });

    // The hero gave the hand up rather than paying the blind it owed (§15); a folded seat builds
    // no word, and the chips it had committed stay in the pot.
    expect(result.current.game.players[0]?.status).toBe("fold");
    expect(result.current.words).toBeNull();
    expect(result.current.game.players[0]?.stack).toBe(1_000);
  });

  test("checks on the deadline when nothing is owed", async () => {
    const result = await table();
    // Pre-flop the hero owes the big blind. Call it, and the table reaches the flop, where a
    // checked round leaves the hero owing nothing.
    await passedToTheHero(result);
    await act(async () => {
      result.current.call();
    });
    await passedToTheHero(result);
    expect(row(result).canCheck).toBe(true);
    const atRest = result.current.game.pot;

    await act(async () => {
      jest.advanceTimersByTime(60_100);
    });
    await passedToTheHero(result);

    // The auto-check took the turn like any other action — it moved no chips, kept the hero in the
    // hand, and closed the flop's round.
    expect(result.current.game.phase).toBe("turn");
    expect(result.current.game.players[0]?.status).not.toBe("fold");
    expect(result.current.game.pot).toBeGreaterThanOrEqual(atRest);
  });
});

/** The seats' pills, in seat order, as the felt reads them. */
function statuses(result: Table): (GamePlayer["status"] | undefined)[] {
  return result.current.game.players.map((player) => player?.status);
}

/** The seats the table is sitting on: exactly one, while a betting round is open. */
function thinkingSeats(result: Table): number[] {
  return result.current.game.players.flatMap((player, seat) =>
    player?.status === "thinking" ? [seat] : [],
  );
}

/** The deal's tiles for one seat, as the table hands them out. */
function seatTiles(seat: number, seed = SEED): readonly Tile[] {
  return dealHand({ seed, playerCount: SEATS }).privateTiles[seat] ?? [];
}

describe("useOfflineGame — the CPU's beat", () => {
  test("moves one seat per beat rather than the round at once", async () => {
    const result = await table(BETTING_SEED);
    await passedToTheHero(result);

    // The blinds are already out, and the seat that opened the round — mira — raised them on its
    // own beat: the raise is on its own nameplate, and no seat is left thinking while the hero
    // holds the table.
    expect(statuses(result)[3]).toBe("raise");
    expect(thinkingSeats(result)).toEqual([]);
    expect(result.current.game.pot).toBe(70);

    const owed = row(result).callAmount ?? 0;
    const potBefore = result.current.game.pot;
    await act(async () => {
      result.current.call();
    });

    // The hero's call is the hero's own transition: the pot took it, the hero's own pill says
    // what it was, and the seat behind the hero is the one the table sits on.
    expect(result.current.game.pot).toBe(potBefore + owed);
    expect(statuses(result)[0]).toBe("call");
    expect(thinkingSeats(result)).toEqual([1]);

    await beat();

    // One beat, one seat: ellis answered it, and the table sits on the next one.
    expect(thinkingSeats(result)).toEqual([2]);
    expect(statuses(result)[0]).toBe("call");
  });

  test("prints a seat's action for the street it was taken on, and only for that street", async () => {
    const result = await table();
    // Pre-flop the hero pays the blind it owes, and the round closes on the big blind's check.
    // The flop is the street that then opens on a check, and the three seats in front of the hero
    // each check it on their own beat.
    await passedToTheHero(result);
    await act(async () => {
      result.current.call();
    });
    await passedToTheHero(result);
    expect(result.current.game.phase).toBe("flop");

    // A check moves no chips and leaves no flag on the seat: the nameplate is the only place it
    // can be read.
    expect(statuses(result).slice(1)).toEqual(["check", "check", "check"]);

    // The hero's check closes the street. A street nobody has acted on yet is what the pills
    // show, so the words from the last one do not survive into it — not the bots' and not the
    // hero's own.
    await act(async () => {
      result.current.check();
    });
    expect(result.current.game.phase).toBe("turn");
    expect(statuses(result)).not.toContain("check");
  });

  test("keeps the hand the hero gave up on the table, rather than running it out in the fold", async () => {
    const result = await table(BETTING_SEED);
    await passedToTheHero(result);

    await act(async () => {
      result.current.fold();
    });

    // The fold is the hero's own transition: the street has not rolled, the pot is where the hero
    // left it — the blinds and mira's raise — and the seat behind the hero is the one the table
    // sits on.
    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.pot).toBe(70);
    expect(statuses(result)[0]).toBe("fold");
    expect(thinkingSeats(result)).toEqual([1]);

    // The rest of the hand is the table's, not the fold's: it plays on the same beat, one seat at
    // a time, with the payout a hand's worth of beats away rather than already paid.
    await beat();
    expect(thinkingSeats(result)).toEqual([2]);
    expect(result.current.game.phase).toBe("preflop");
  });

  test("confirms the bots' words on their own beats inside §19's window", async () => {
    // Every seat has a word in this dictionary — the hero's own tiles and each bot's — so the
    // window can close on the seats rather than on the clock, and the beats it took to close are
    // what this test counts.
    const dictionary = testDictionary([0, 1, 2, 3].map((seat) => spells(seatTiles(seat))));
    const { result } = await renderHook(() => useOfflineGame({ seed: SEED, dictionary }));
    const felt = result as Table;

    await playToWindow(felt);
    await buildHeroWord(felt);

    // The hero's confirm is the hero's own transition: the window is still open on the bots'
    // slots, and nothing has answered for them.
    expect(felt.current.game.phase).toBe("river");

    let beats = 0;
    for (let step = 0; step < 10 && felt.current.game.phase !== "payout"; step += 1) {
      await beat();
      beats += 1;
    }

    // One seat per beat: the three bots still in the hand, and then the window is settled.
    expect(felt.current.game.phase).toBe("payout");
    expect(beats).toBe(3);
  });
});

describe("useOfflineGame — §19's window", () => {
  test("builds the hero's word from its own tiles, and pays out on the confirmation", async () => {
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
    await runWindowClockOut(result);

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
    const result = await table();
    await playToWindow(result);
    await buildHeroWord(result);
    await runWindowClockOut(result);
    const finished = result.current.game.id;

    await act(async () => {
      result.current.deal();
    });
    await passedToTheHero(result);

    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.id).not.toBe(finished);
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    // The fresh deal leaves the first turn to a bot, exactly as the session's first one did: the
    // table is on that seat until its beat passes, and then the hero's row is armed again.
    expect(result.current.game.players[0]?.status).toBe("your-turn");
    // A fresh hand is a fresh, empty draft — open to build again, and cleared of the last one.
    expect(result.current.words).toMatchObject({ plays: [], word: "", open: true, confirmable: false });
  });

  test("keeps every letter of a word a multiplier tile prints at its §6 value", async () => {
    const tiles = heroTiles();
    const letters = tiles.map((tile) => LETTER_VALUES[tile.letter as Letter]);

    expect(expectedScore(tiles)).toBe(letters.reduce((sum, value) => sum + value, 0));
  });
});

describe("useOfflineGame — the chips in flight", () => {
  test("names the hand, not the turn, so a per-hand effect has something stable to key on", async () => {
    const result = await table();
    const opening = result.current.game;

    expect(opening.handId).toBe("offline-hand-1");

    await takeTurn(result);

    // The turn moved — the HUD re-anchors on that — and the hand did not.
    expect(result.current.game.id).not.toBe(opening.id);
    expect(result.current.game.handId).toBe(opening.handId);
  });

  test("posts the blinds at the deal: the chips are in the pot before any seat has acted", async () => {
    const result = await table(BETTING_SEED);

    // The deal commits both blinds (§5, §14), so the first frame is already 30 chips deep — and no
    // flight carries them. The deal is the state the felt starts from, not a transition it plays,
    // and a flight is read off the commitments either side of a transition.
    expect(result.current.game.flights).toEqual([]);
    expect(result.current.game.pot).toBe(30);

    await passedToTheHero(result);

    // mira's raise came through the beat, and it is on the felt as a flight rather than as a pot
    // that moved on its own.
    expect(result.current.game.pot).toBe(70);
    expect(result.current.game.flights.map((flight) => flight.seatIndex)).toContain(3);
  });

  test("sends a flight for what a seat paid, when it paid it", async () => {
    const result = await table(BETTING_SEED);
    await passedToTheHero(result);

    const owed = row(result).callAmount ?? 0;
    await takeTurn(result);

    const { flights, pot } = result.current.game;
    // The hero paid the call the row stated, on the street it was paid in: its own beat's flight,
    // and not a share of a batch the whole round moved in.
    expect(flights).toContainEqual({
      id: "offline-hand-1:preflop:0:in",
      seatIndex: 0,
      amount: owed,
      direction: "in",
    });
    // No seat has two nodes on the same path, and every chip the middle holds is one of these
    // flights or one of the two blinds the deal posted: nothing else reaches the pot without a
    // flight to carry it.
    expect(new Set(flights.map((flight) => flight.id)).size).toBe(flights.length);
    expect(flights.reduce((total, flight) => total + flight.amount, 0)).toBe(pot - BLINDS_POSTED);
  });

  test("keeps the flights it already has when the same state is rendered again", async () => {
    const dictionary = testDictionary([heroWord(BETTING_SEED)]);
    const { result, rerender } = await renderHook(() =>
      useOfflineGame({ seed: BETTING_SEED, dictionary }),
    );
    const felt = result as Table;

    await takeTurn(felt);
    const ids = felt.current.game.flights.map((flight) => flight.id);
    expect(ids.length).toBeGreaterThan(0);

    // The chips are put in the air by the transition that committed them, never by a render: a
    // seat re-rendering the table — the HUD's clock ticks once a second — carries the same chips.
    await rerender(undefined);
    await rerender(undefined);

    expect(felt.current.game.flights.map((flight) => flight.id)).toEqual(ids);
  });

  test("ends a flight exactly once, by the id the layer reported", async () => {
    const result = await table(BETTING_SEED);

    await takeTurn(result);

    const ids = result.current.game.flights.map((flight) => flight.id);
    expect(ids.length).toBeGreaterThan(1);
    const [landed, ...stillFlying] = ids;

    await act(async () => {
      result.current.endChipFlight(landed ?? "");
    });

    expect(result.current.game.flights.map((flight) => flight.id)).toEqual(stillFlying);

    // The layer reports its own flight, and nothing else would; a report that arrives twice is
    // not a second landing.
    await act(async () => {
      result.current.endChipFlight(landed ?? "");
    });

    expect(result.current.game.flights.map((flight) => flight.id)).toEqual(stillFlying);
  });

  test("leaves no flight from the last hand when the next one is dealt", async () => {
    const result = await table(BETTING_SEED);
    await takeTurn(result);
    await playToWindow(result);
    await buildHeroWord(result);
    await runWindowClockOut(result);

    // A test has no layer over the felt, so nothing reports these chips landing: the hand ends
    // with its flights still in the air, which is exactly what the deal has to clear.
    expect(result.current.game.flights.length).toBeGreaterThan(0);

    await act(async () => {
      result.current.deal();
    });

    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.handId).toBe("offline-hand-2");
    expect(result.current.game.flights).toEqual([]);
  });
});
