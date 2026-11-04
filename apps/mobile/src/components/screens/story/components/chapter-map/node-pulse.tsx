import { useEffect, type ReactElement } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useLoopsEnabled } from "@/motion";

import { NODE_COLUMN } from "./chapter-map-ink";

/** The available node's halo: grows and fades on a loop, or holds still under reduced motion. */
export function NodePulse({ size }: { size: number }): ReactElement {
  const reduceMotion = useReducedMotion();
  const loopsEnabled = useLoopsEnabled();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || !loopsEnabled) {
      cancelAnimation(progress);
      progress.value = 0.3;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [loopsEnabled, progress, reduceMotion]);

  const ring = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 0.92 + 0.38 * progress.value }],
  }));
  const ringSize = size + 28;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, left: (NODE_COLUMN - ringSize) / 2 }, ring]}
    />
  );
}

const styles = StyleSheet.create({
  pulse: {
    position: "absolute",
    top: -14,
    boxShadow: "0px 0px 0px 3px rgba(255,214,120,0.9), 0px 0px 30px 8px rgba(255,200,90,0.55)",
  },
});
