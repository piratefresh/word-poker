import { useCallback, useState } from "react";

import type { ResultsSnapshot } from "./results-types";

/** Hold the local winner overlay until Continue opens the existing hand results controls. */
export function useSimpleWinCelebration(snapshot: ResultsSnapshot | null) {
  const [completedHand, setCompletedHand] = useState<number | null>(null);
  const eligible = snapshot?.seats.some((seat) => seat.isYou && seat.takesPot) ?? false;
  const hand = snapshot !== null && eligible ? snapshot.hand : null;
  const active = hand !== null && hand !== completedHand;

  const complete = useCallback(() => {
    if (hand !== null) setCompletedHand(hand);
  }, [hand]);

  return { active, complete };
}
