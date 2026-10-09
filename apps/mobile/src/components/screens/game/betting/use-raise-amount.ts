import { useCallback, useState } from "react";

import type { BettingState } from "../game-types";

/**
 * Zero selects check/call. Positive wagers are clamped to the engine's bounds and snapped
 * to its step. A new turn resets the selection even when its bounds stay the same.
 */
export function useRaiseAmount(
  betting: BettingState,
  onChange?: (amount: number) => void,
  turnKey = "",
) {
  // Never carry a previous turn's selected wager into the next action.
  const boundsKey = `${turnKey}:${betting.minRaise}:${betting.maxRaise}:${betting.primary}`;
  const [raise, setRaise] = useState({
    key: boundsKey,
    amount: 0,
  });
  if (raise.key !== boundsKey)
    setRaise({ key: boundsKey, amount: 0 });
  const amount = raise.key !== boundsKey || raise.amount === 0 ? 0 : Math.max(
    betting.minRaise,
    Math.min(Math.max(betting.maxRaise, betting.minRaise), raise.amount),
  );

  const { minRaise, maxRaise, raiseStep } = betting;
  const change = useCallback(
    (next: number) => {
      const stepped = Math.round(next / raiseStep) * raiseStep;
      const value = stepped <= 0 ? 0 : Math.max(minRaise, Math.min(maxRaise, stepped));
      setRaise({ key: boundsKey, amount: value });
      onChange?.(value);
    },
    [boundsKey, minRaise, maxRaise, raiseStep, onChange],
  );

  return [amount, change] as const;
}
