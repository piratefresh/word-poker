import { renderHook } from "@testing-library/react-native";
import * as mockReact from "react";

import { ROUND_PHASES, type RoundPhase } from "@wordpoker/contracts";

import { usePhaseClock } from "./phase-clock";

// The shipped reanimated mock builds a fresh shared value on every render, while
// Reanimated itself memoizes it per hook slot. Nothing on screen can tell the two apart
// — the style callbacks just read whatever value they were handed — but this suite is
// about what survives a re-render, so the difference is fatal here. One faithful override.
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock");
  const useSharedValue = (initial: unknown) => {
    const ref = mockReact.useRef<{ value: unknown } | null>(null);
    ref.current ??= { value: initial };
    return ref.current;
  };
  return { ...mock, useSharedValue };
});

type Props = { handId: string; phase: RoundPhase };

function renderClock(initialProps: Props) {
  return renderHook(({ handId, phase }: Props) => usePhaseClock(handId, phase), {
    initialProps,
  });
}

test("ticks once per phase change and never on a re-render", async () => {
  const { result, rerender } = await renderClock({ handId: "hand-1", phase: "preflop" });

  // The mount is the first tick: an effect that only listened for a *change* would never
  // run on a screen that opened mid-hand.
  expect(result.current.tick.value).toBe(1);

  await rerender({ handId: "hand-1", phase: "preflop" });
  expect(result.current.tick.value).toBe(1);

  await rerender({ handId: "hand-1", phase: "flop" });
  expect(result.current.tick.value).toBe(2);

  // The next hand opens on preflop again — same street, new hand — and it is still a
  // change the effects have to see.
  await rerender({ handId: "hand-2", phase: "preflop" });
  expect(result.current.tick.value).toBe(3);
});

test("carries the street's ordinal, not the HUD's display stamp", async () => {
  const { result, rerender } = await renderClock({ handId: "hand-1", phase: "preflop" });

  expect(result.current.phase.value).toBe(ROUND_PHASES.indexOf("preflop"));

  await rerender({ handId: "hand-1", phase: "flop" });
  // The HUD stamps the flop as `PHASE 3`; the clock counts streets from zero.
  expect(result.current.phase.value).toBe(1);
});
