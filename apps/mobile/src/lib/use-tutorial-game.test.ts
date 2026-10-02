import { act, renderHook } from "@testing-library/react-native";

import {
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  applyTutorialAction,
  nextScriptedAction,
} from "@wordpoker/game-rules";

import { duration } from "@/constants/theme";

import { testDictionary } from "./dictionary-fixtures";
import { useTutorialGame, type TutorialGame } from "./use-tutorial-game";

// The HUD's loop gate asks the router whether its screen is on top; see use-offline-game.test.ts.
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));

// Spied through, so a test can see whether the lesson still moves the table after it is gone.
jest.mock("@wordpoker/game-rules", () => {
  const actual = jest.requireActual<typeof import("@wordpoker/game-rules")>("@wordpoker/game-rules");
  return {
    ...actual,
    applyTutorialAction: jest.fn(actual.applyTutorialAction),
    nextScriptedAction: jest.fn(actual.nextScriptedAction),
  };
});

/** The lesson's words, and the alternatives a player might build instead. */
const dictionary = testDictionary(["BROWN", "BROWNE", "GONER", "ROB"]);
const BEAT = duration.cpuBeat;
/** Longer than any deadline the table has: the betting turn's and §19's window's. */
const LONG_HOLD = 10 * Math.max(OFFLINE_TURN_MS, WORD_WINDOW_MS);
const BROWN = ["B-2", "R-3", "O-5", "W-1", "N-5"].map((tileId) => ({ tileId }));

type Lesson = { current: TutorialGame };

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function press(fn: () => void) {
  await act(async () => fn());
}

function seat(lesson: Lesson, name: string) {
  return lesson.current.game.players.find((player) => player?.name === name);
}

/** Taps Next until the coach shows the step named, or gives up. */
async function nextUntil(lesson: Lesson, id: string) {
  for (let guard = 0; guard < 12 && lesson.current.coach?.steps[lesson.current.coach.index]?.id !== id; guard += 1) {
    const next = lesson.current.coach?.onNext;
    if (next === undefined) break;
    await press(next);
  }
  expect(lesson.current.coach?.steps[lesson.current.coach.index]?.id).toBe(id);
}

/** Lets the table run — beat by beat — until the coach puts a card up. */
async function playUntilCard(lesson: Lesson) {
  for (let beats = 0; beats < 20 && lesson.current.coach === null; beats += 1) await wait(BEAT);
  expect(lesson.current.coach).not.toBeNull();
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useTutorialGame (STO-507)", () => {
  it("holds the table while the coach explains, however long, and plays one bot beat at a time once released", async () => {
    const { result } = await renderHook(() => useTutorialGame({ dictionary }));

    expect(result.current.coach?.steps[result.current.coach.index]?.id).toBe("lesson-table");
    expect(result.current.held).toBe(true);
    await wait(LONG_HOLD);
    // Nobody moved: Mira is still to act, and only the blinds are in.
    expect(result.current.game.pot).toBe(30);
    expect(seat(result, "Mira")?.status).not.toBe("fold");

    await nextUntil(result, "lesson-rack");
    await press(() => result.current.coach?.onNext?.());
    // The coach waits on the hero's call; until Mira has folded there is nothing to show.
    expect(result.current.coach).toBeNull();
    expect(result.current.held).toBe(false);

    await wait(BEAT - 1);
    expect(seat(result, "Mira")?.status).not.toBe("fold");
    await wait(1);
    expect(seat(result, "Mira")?.status).toBe("fold");
    expect(result.current.coach?.steps[result.current.coach.index]?.id).toBe("lesson-call");
    expect(result.current.held).toBe(true);
  });

  it("never times the hero out while a card is up, and drops a move off the script", async () => {
    const { result } = await renderHook(() => useTutorialGame({ dictionary }));
    await nextUntil(result, "lesson-rack");
    await press(() => result.current.coach?.onNext?.());
    await playUntilCard(result);

    await wait(LONG_HOLD);
    expect(result.current.game.betting.callAmount).toBe(20);

    await press(() => result.current.fold());
    expect(result.current.divergence).toEqual({
      stepId: "preflop-hero-call",
      expected: "hero to call",
      found: "hero fold",
    });
    expect(seat(result, "Guest")?.status).not.toBe("fold");

    await press(() => result.current.primary());
    expect(result.current.divergence).toBeNull();
    expect(result.current.game.pot).toBe(50);
  });

  it("plays the whole lesson to the real payout, then restarts it clean", async () => {
    const { result } = await renderHook(() => useTutorialGame({ dictionary }));
    await nextUntil(result, "lesson-rack");
    await press(() => result.current.coach?.onNext?.());

    await playUntilCard(result); // lesson-call
    await press(() => result.current.primary());
    await playUntilCard(result); // lesson-flop, once Jay has bet
    expect(result.current.game.phase).toBe("flop");
    await press(() => result.current.setDraft(BROWN));
    await nextUntil(result, "lesson-raise");
    await press(() => result.current.wager(60));
    await playUntilCard(result); // lesson-turn
    expect(result.current.game.phase).toBe("turn");
    await press(() => result.current.primary());
    await playUntilCard(result); // lesson-river
    await press(() => result.current.primary());
    await playUntilCard(result); // lesson-word, in §19's window
    expect(result.current.words?.confirmable).toBe(true);
    await press(() => result.current.primary());
    expect(result.current.coach?.steps[result.current.coach.index]?.id).toBe("lesson-showdown");
    await press(() => result.current.coach?.onNext?.());
    await wait(BEAT);

    expect(result.current.game.phase).toBe("payout");
    const results = result.current.results;
    expect(results).not.toBeNull();
    expect(seat(result, "Guest")?.stack).toBe(1100);

    await press(() => result.current.restart());
    expect(result.current.game.phase).toBe("preflop");
    expect(result.current.game.pot).toBe(30);
    expect(result.current.game.flights).toEqual([]);
    expect(result.current.words?.plays ?? []).toEqual([]);
    expect(result.current.coach?.steps[result.current.coach.index]?.id).toBe("lesson-table");
  });

  it("leaves nothing running once the screen is gone", async () => {
    const { result, unmount } = await renderHook(() => useTutorialGame({ dictionary }));
    await nextUntil(result, "lesson-rack");
    await press(() => result.current.coach?.onNext?.());
    // Released: Mira's beat and her turn's deadline are both armed.
    expect(result.current.held).toBe(false);
    await unmount();
    jest.mocked(nextScriptedAction).mockClear();
    jest.mocked(applyTutorialAction).mockClear();

    // Past every deadline the table could have armed: no beat asks the script for a move, and no
    // clock settles a turn through the lesson's gate.
    await wait(LONG_HOLD);
    expect(nextScriptedAction).not.toHaveBeenCalled();
    expect(applyTutorialAction).not.toHaveBeenCalled();
  });
});
