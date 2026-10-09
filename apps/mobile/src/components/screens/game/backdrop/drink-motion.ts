import { useContext, useEffect, useRef } from "react";
import { useReducedMotion } from "react-native-reanimated";

import { CoinBowlGameContext } from "./coin-bowl-motion";

const PHASE_FILL = { preflop: 1, flop: 0.75, turn: 0.5, river: 0.25, payout: 0 } as const;
const DRAIN_DURATION_MS = 450;

type ApplyDrink = (fill: number, sip: boolean, reducedMotion: boolean) => void | (() => void);

/** Synchronize the decoration with the same game snapshot the coin bowl receives. */
export function useDrinkFill(apply: ApplyDrink | null) {
  const game = useContext(CoinBowlGameContext);
  const fill = game?.sessionOver ? 0 : game ? PHASE_FILL[game.phase] : 1;
  const handId = game?.handId;
  const reducedMotion = useReducedMotion();
  const previous = useRef<{ apply: ApplyDrink; fill: number; handId: string | undefined } | null>(null);
  const displayedFill = useRef<number>(fill);

  useEffect(() => {
    if (!apply) {
      previous.current = null;
      return;
    }
    const old = previous.current;
    const sip = !!old && old.apply === apply && old.handId === handId && fill < old.fill;
    previous.current = { apply, fill, handId };
    if (!sip || reducedMotion) {
      displayedFill.current = fill;
      return apply(fill, false, reducedMotion);
    }

    // This asset binds the liquid directly to fillLevel; animate the binding on both platforms.
    const from = displayedFill.current;
    let cleanup = apply(from, true, false);
    let started: number | undefined;
    let frame = requestAnimationFrame(function drain(now) {
      started ??= now;
      const progress = Math.min((now - started) / DRAIN_DURATION_MS, 1);
      const eased = progress * progress * (3 - 2 * progress);
      displayedFill.current = from + (fill - from) * eased;
      cleanup?.();
      cleanup = apply(displayedFill.current, false, false);
      if (progress < 1) frame = requestAnimationFrame(drain);
    });
    return () => {
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [apply, fill, handId, reducedMotion]);
}
