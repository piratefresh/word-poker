import { render } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";

import { FOUR_PLAYER_FLOP_FIXTURE } from "../game-fixtures";
import type { GameScreenState } from "../game-types";
import { CoinBowlGameContext } from "./coin-bowl-motion";
import { useDrinkFill } from "./drink-motion";

jest.mock("react-native-reanimated", () => ({ useReducedMotion: jest.fn(() => false) }));

const game = (phase: GameScreenState["phase"], handId = "hand-1", sessionOver = false): GameScreenState => ({
  ...FOUR_PLAYER_FLOP_FIXTURE, phase, handId, sessionOver,
});

function Probe({ apply }: { apply: (fill: number, sip: boolean, reduced: boolean) => void }) {
  useDrinkFill(apply);
  return null;
}

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const advance = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
};

beforeEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false);
  frames = new Map();
  nextFrame = 0;
  jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation((id) => {
    if (id != null) frames.delete(id);
  });
});

afterEach(() => jest.restoreAllMocks());

test("phase advancement animates the liquid through intermediate levels and cancels on unmount", async () => {
  const apply = jest.fn();
  const scene = (phase: GameScreenState["phase"]) => (
    <CoinBowlGameContext.Provider value={game(phase)}><Probe apply={apply} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene("preflop"));
  await view.rerender(scene("flop"));
  advance(0);
  advance(225);
  const halfway = apply.mock.calls.at(-1)?.[0];
  expect(halfway).toBeLessThan(1);
  expect(halfway).toBeGreaterThan(0.75);
  advance(450);
  expect(apply).toHaveBeenLastCalledWith(0.75, false, false);
  await view.rerender(scene("turn"));
  await view.unmount();
  const count = apply.mock.calls.length;
  advance(900);
  expect(apply).toHaveBeenCalledTimes(count);
});

test("a faster phase change continues from the visible level and a new hand cancels the drain", async () => {
  const apply = jest.fn();
  const scene = (phase: GameScreenState["phase"], handId = "hand-1") => (
    <CoinBowlGameContext.Provider value={game(phase, handId)}><Probe apply={apply} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene("preflop"));
  await view.rerender(scene("flop"));
  advance(0);
  advance(225);
  const visibleFill = apply.mock.calls.at(-1)?.[0];
  await view.rerender(scene("turn"));
  expect(apply).toHaveBeenLastCalledWith(visibleFill, true, false);
  advance(225);
  advance(450);
  expect(apply.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.5);
  await view.rerender(scene("preflop", "hand-2"));
  expect(apply).toHaveBeenLastCalledWith(1, false, false);
  expect(frames.size).toBe(0);
});

test("drains once per phase and refills without sipping on the next hand", async () => {
  const apply = jest.fn();
  const scene = (state: GameScreenState) => (
    <CoinBowlGameContext.Provider value={state}><Probe apply={apply} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene(game("preflop")));
  expect(apply).toHaveBeenLastCalledWith(1, false, false);
  for (const [phase, fill] of [["flop", 0.75], ["turn", 0.5], ["river", 0.25], ["payout", 0]] as const) {
    await view.rerender(scene(game(phase)));
    expect(apply.mock.calls.at(-1)?.[1]).toBe(true);
    advance(0);
    advance(450);
    expect(apply).toHaveBeenLastCalledWith(fill, false, false);
    const count = apply.mock.calls.length;
    await view.rerender(scene({ ...game(phase), id: "another-turn", secondsRemaining: 12 }));
    expect(apply).toHaveBeenCalledTimes(count);
  }
  await view.rerender(scene(game("preflop", "hand-2")));
  expect(apply).toHaveBeenLastCalledWith(1, false, false);
});

test("joining mid-hand sets the current fill without sipping; game over empties it", async () => {
  const apply = jest.fn();
  const scene = (state: GameScreenState) => (
    <CoinBowlGameContext.Provider value={state}><Probe apply={apply} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene(game("turn")));
  expect(apply).toHaveBeenLastCalledWith(0.5, false, false);
  await view.rerender(scene(game("turn", "hand-1", true)));
  advance(0);
  advance(450);
  expect(apply).toHaveBeenLastCalledWith(0, false, false);
});

test("reduced motion still updates fill, suppresses sip, and does not replay it when enabled", async () => {
  jest.mocked(useReducedMotion).mockReturnValue(true);
  const apply = jest.fn();
  const scene = (phase: GameScreenState["phase"]) => (
    <CoinBowlGameContext.Provider value={game(phase)}><Probe apply={apply} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene("preflop"));
  await view.rerender(scene("flop"));
  expect(apply).toHaveBeenLastCalledWith(0.75, false, true);
  jest.mocked(useReducedMotion).mockReturnValue(false);
  await view.rerender(scene("flop"));
  expect(apply).toHaveBeenLastCalledWith(0.75, false, false);
});

test("a runtime that loads after a phase change receives the latest fill without a stale sip", async () => {
  const apply = jest.fn();
  function LoadingProbe({ ready }: { ready: boolean }) {
    useDrinkFill(ready ? apply : null);
    return null;
  }
  const scene = (phase: GameScreenState["phase"], ready: boolean) => (
    <CoinBowlGameContext.Provider value={game(phase)}><LoadingProbe ready={ready} /></CoinBowlGameContext.Provider>
  );
  const view = await render(scene("preflop", false));
  await view.rerender(scene("river", true));
  expect(apply).toHaveBeenCalledWith(0.25, false, false);
});
