import { act, renderHook } from "@testing-library/react-native";

import type { Tile } from "@wordpoker/contracts";
import { LETTER_VALUES, dealHand, type Letter } from "@wordpoker/game-rules";

import { testDictionary } from "./dictionary-fixtures";
import { useOfflineGame, type OfflineGame } from "./use-offline-game";

const SEED = 7;
const ROUNDS = 4;
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

/** The word the hero's plays spell (§10): a sequence tile contributes both of its letters. */
function heroWord(seed = SEED): string {
  return heroTiles(seed)
    .map((tile) => ("sequenceLetter" in tile ? `${tile.letter}${tile.sequenceLetter}` : tile.letter))
    .join("");
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

/** The hero taps once per street; the bots' turns are resolved with it. */
async function advanceStreet(result: Table) {
  await act(async () => {
    result.current.advance();
  });
}

/** Four taps walk preflop → flop → turn → river, and the river's close opens §19's window. */
async function advanceToWordWindow(result: Table) {
  for (let street = 0; street < ROUNDS; street += 1) await advanceStreet(result);
}

/** The hero plays both of its tiles, in order, and confirms the word they spell. */
async function buildHeroWord(result: Table) {
  for (const play of heroTiles().map(playOf)) {
    await act(async () => {
      result.current.play(play.tileId, play.chosenFace);
    });
  }

  await act(async () => {
    result.current.confirmWord();
  });
}

/**
 * §19's window closes with the clock run out — how a window ends while a seat that has nothing
 * to confirm is still drafting. The tap that does it is the table's clock, not a seat's turn.
 */
async function runWindowClockOut(result: Table) {
  await act(async () => {
    result.current.advance();
  });
}

describe("useOfflineGame", () => {
  test("deals a hand the felt can render as it stands", async () => {
    const result = await table();

    expect(result.current.game).toMatchObject({
      phase: "preflop",
      phaseNumber: 2,
      seatCount: 4,
      pot: 0,
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
    // The felt badges this seat "· YOU" and the HUD names it when it announces the turn,
    // so exactly one seat — the hero's — has to carry the flag.
    expect(
      result.current.game.players.filter((player) => player?.isHero).map((player) => player?.id),
    ).toEqual(["hero"]);

    // §19's window has not opened, so there is no draft to build yet.
    expect(result.current.words).toBeNull();
  });

  test("keeps the unrevealed board slots null and fills them down the streets", async () => {
    const result = await table();

    const revealedPerStreet = [3, 4, 5];
    for (const [street, revealed] of revealedPerStreet.entries()) {
      await advanceStreet(result);

      const community = result.current.game.community;
      expect(community).toHaveLength(5);
      expect(community.filter((tile) => tile !== null)).toHaveLength(revealed);
      expect(community.slice(revealed)).toEqual(Array(5 - revealed).fill(null));
      expect(result.current.game.phaseNumber).toBe(3 + street);

      // The bots take their turns inside the tap, so the table is back on the hero.
      expect(result.current.game.players[0]?.status).toBe("your-turn");
    }
  });

  test("opens a fresh turn per street, so the HUD's countdown re-anchors", async () => {
    const result = await table();
    const first = result.current.game.id;

    await advanceStreet(result);

    expect(result.current.game.id).not.toBe(first);
  });

  test("opens §19's word window after the river, with the hero's draft ready", async () => {
    const result = await table();

    await advanceToWordWindow(result);

    // The window is the table's, not a seat's: nobody is to act, and the HUD counts its
    // sixty seconds rather than a turn's thirty.
    expect(result.current.game.phase).toBe("river");
    expect(result.current.game.secondsRemaining).toBe(60);

    expect(result.current.words).toMatchObject({
      plays: [],
      word: "",
      reason: null,
      confirmed: false,
      open: true,
    });
  });

  test("builds the hero's word from its own tiles, and pays out on the confirmation", async () => {
    const result = await table();
    await advanceToWordWindow(result);

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.play(plays[0]?.tileId ?? "", plays[0]?.chosenFace);
    });

    // The draft is the engine's slot, not a local mirror: one tap is one play, and the word
    // is the letters those tiles print.
    expect(result.current.words?.plays).toHaveLength(1);
    expect(result.current.words?.open).toBe(true);

    await act(async () => {
      result.current.play(plays[1]?.tileId ?? "", plays[1]?.chosenFace);
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
    expect(result.current.game.players.filter((player) => player?.status === "winner")).toHaveLength(1);
  });

  test("refuses a play the tiles cannot make, and keeps the draft it had", async () => {
    const result = await table();
    await advanceToWordWindow(result);

    const [first] = heroTiles().map(playOf);
    await act(async () => {
      result.current.play(first?.tileId ?? "");
    });
    // §11: a physical tile is played once. The engine refuses the second play and the draft
    // is left exactly as it was, with the reason on screen.
    await act(async () => {
      result.current.play(first?.tileId ?? "");
    });

    expect(result.current.words?.plays).toHaveLength(1);
    expect(result.current.words?.reason).toBe("tile-reused");
  });

  test("takes a play back, and clears the draft the hero wants to start over", async () => {
    const result = await table();
    await advanceToWordWindow(result);

    const plays = heroTiles().map(playOf);
    await act(async () => {
      result.current.play(plays[0]?.tileId ?? "");
    });
    await act(async () => {
      result.current.play(plays[1]?.tileId ?? "");
    });
    await act(async () => {
      result.current.removePlay(0);
    });
    expect(result.current.words?.plays).toEqual([plays[1]]);

    await act(async () => {
      result.current.clearDraft();
    });
    expect(result.current.words).toMatchObject({ plays: [], word: "" });
  });

  test("starts the next hand from the payout, on a fresh deal", async () => {
    const result = await table();
    await advanceToWordWindow(result);
    await buildHeroWord(result);
    await runWindowClockOut(result);
    const finished = result.current.game.id;

    await act(async () => {
      result.current.deal();
    });

    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.id).not.toBe(finished);
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    expect(result.current.game.players[0]?.status).toBe("your-turn");
    expect(result.current.words).toBeNull();
  });

  test("plays the same hand twice for the same seed, and a different one for another", async () => {
    const first = await table();
    await advanceStreet(first);

    const replay = await table();
    await advanceStreet(replay);
    expect(replay.current.game.community).toEqual(first.current.game.community);

    const other = await table(SEED + 1);
    expect(other.current.game.privateTiles).not.toEqual(first.current.game.privateTiles);
  });

  test("keeps every letter of a word a multiplier tile prints at its §6 value", async () => {
    const tiles = heroTiles();
    const letters = tiles.map((tile) => LETTER_VALUES[tile.letter as Letter]);

    expect(expectedScore(tiles)).toBe(letters.reduce((sum, value) => sum + value, 0));
  });
});
