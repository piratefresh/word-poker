import { act, renderHook } from "@testing-library/react-native";

import { useOfflineGame, type OfflineGame } from "./use-offline-game";

const SEED = 7;
const ROUNDS = 4;

/** The hook's live result, as `renderHook` hands it over. */
type Table = { current: OfflineGame };

async function table(seed = SEED): Promise<Table> {
  const { result } = await renderHook(() => useOfflineGame({ seed }));
  return result as Table;
}

/** The hero taps once per street; the bots' turns are resolved with it. */
async function advanceStreet(result: Table) {
  await act(async () => {
    result.current.advance();
  });
}

/**
 * Taps through the four streets and then through §19's word window: the river's last tap
 * opens the window and the tap after it closes the window with the clock run out, which is
 * where the hand pays out.
 */
async function advanceToPayout(result: Table) {
  for (let tap = 0; tap < ROUNDS + 1; tap += 1) await advanceStreet(result);
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

  test("opens §19's word window after the river, and pays out when the next tap closes it", async () => {
    const result = await table();

    for (let street = 0; street < ROUNDS; street += 1) await advanceStreet(result);

    // The window is the table's, not a seat's: nobody is to act, and the HUD counts its
    // sixty seconds rather than a turn's thirty.
    expect(result.current.game.phase).toBe("river");
    expect(result.current.game.secondsRemaining).toBe(60);

    await advanceStreet(result);

    expect(result.current.game.phase).toBe("payout");
  });

  test("pays out with a winner and the winning score", async () => {
    const result = await table();

    await advanceToPayout(result);

    const { players, phase, bestScore } = result.current.game;
    expect(phase).toBe("payout");
    expect(players.filter((player) => player?.status === "winner")).toHaveLength(1);
    expect(players.filter((player) => player?.status === "waiting")).toHaveLength(3);
    expect(bestScore).toBeGreaterThan(0);
  });

  test("starts the next hand from the payout, on a fresh deal", async () => {
    const result = await table();
    await advanceToPayout(result);
    const finished = result.current.game.id;

    await act(async () => {
      result.current.deal();
    });

    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.id).not.toBe(finished);
    expect(result.current.game.community).toEqual([null, null, null, null, null]);
    expect(result.current.game.players[0]?.status).toBe("your-turn");
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
});
