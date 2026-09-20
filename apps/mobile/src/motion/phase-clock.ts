/**
 * phase-clock.ts — the one clock every in-hand one-shot restarts from.
 *
 * The plan's rule (WP-412 §03): no effect is triggered by a remount, so nothing remounts
 * when the street moves. A phase change bumps `tick`, and each effect restarts from it
 * with `useAnimatedReaction` — which is also what keeps a seat's status change from
 * re-dealing the community tiles, and a reconnect that skips two streets from stranding
 * a sequence.
 */

import { ROUND_PHASES, type RoundPhase } from "@wordpoker/contracts";
import { useEffect } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

export interface PhaseClock {
  /** The phase's ordinal — its index in `ROUND_PHASES` — on the UI thread. */
  phase: SharedValue<number>;
  /** Increments once per phase change; a new hand counts as a change. */
  tick: SharedValue<number>;
}

/**
 * Watch a hand's phase. `handId` is part of the identity: the next hand opens on preflop
 * again, and that is a change the effects have to see.
 *
 * The ordinal is `ROUND_PHASES`' index, not the HUD's `PHASE_NUMBER`: the stamp is display
 * numbering (preflop reads 2), and a clock that counted from it would open a street short.
 */
export function usePhaseClock(handId: string, phase: RoundPhase): PhaseClock {
  const phaseValue = useSharedValue(ROUND_PHASES.indexOf(phase));
  const tick = useSharedValue(0);

  useEffect(() => {
    phaseValue.value = ROUND_PHASES.indexOf(phase);
    tick.value += 1;
  }, [handId, phase, phaseValue, tick]);

  return { phase: phaseValue, tick };
}
