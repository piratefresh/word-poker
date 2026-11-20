import type { SharedValue } from "react-native-reanimated";

/**
 * Puts a shared value back to 0 and repaints every style that reads it, even when it already reads 0.
 *
 * On native, Reanimated 4 copies a finished animation's last frame into React state
 * (`FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS`). A re-render can land that stale frame after a plain
 * `.set(0)` has run, and every later `.set(0)` is then skipped as a no-op, so the frame sticks: the
 * home street stayed zoomed through the door under the warm interior, a blank orange screen.
 * Forcing the update re-runs the mappers, so the reset always reaches the view.
 */
export function forceReset(value: SharedValue<number>) {
  value.modify(() => {
    "worklet";
    return 0;
  }, true);
}
