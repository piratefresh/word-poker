/**
 * loop-gate.ts — whether the screen's loops are allowed to run.
 *
 * The in-hand loops (the seat ring, the timer pulse) have no natural end, so they are
 * stopped rather than left running behind a pushed screen or a backgrounded app (WP-412
 * AC9). Reduced motion is not this hook's business: each effect asks Reanimated's
 * `useReducedMotion` for itself, the way the tile primitive already does.
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

export function useLoopsEnabled(): boolean {
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(() => AppState.currentState === "active");

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  return focused && active;
}
