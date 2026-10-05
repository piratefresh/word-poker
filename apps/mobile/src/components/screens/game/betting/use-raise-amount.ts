import { useCallback, useState } from "react";

import type { BettingState } from "../game-types";

/**
 * The wager slider's amount, clamped to the round's bounds and snapped to its step. `onChange`
 * hears every amount the seat settles on.
 */
export function useRaiseAmount(
  betting: BettingState,
  onChange?: (amount: number) => void,
) {
  // The slider's amount belongs to the round, not to the screen: a new street — or a bet the
  // hero has to answer — moves the raise floor, and an amount left over from the last round
  // would offer a raise the engine refuses. Keying on the bounds re-seeds the amount exactly
  // when they move, not while the seat is dragging.
  const boundsKey = `${betting.minRaise}:${betting.maxRaise}`;
  const [raise, setRaise] = useState({
    key: boundsKey,
    amount: betting.raiseAmount,
  });
  if (raise.key !== boundsKey)
    setRaise({ key: boundsKey, amount: betting.raiseAmount });
  const amount = Math.max(
    betting.minRaise,
    Math.min(Math.max(betting.maxRaise, betting.minRaise), raise.amount),
  );

  const { minRaise, maxRaise, raiseStep } = betting;
  const change = useCallback(
    (next: number) => {
      const stepped = Math.round(next / raiseStep) * raiseStep;
      const value = Math.max(minRaise, Math.min(maxRaise, stepped));
      setRaise({ key: boundsKey, amount: value });
      onChange?.(value);
    },
    [boundsKey, minRaise, maxRaise, raiseStep, onChange],
  );

  return [amount, change] as const;
}
