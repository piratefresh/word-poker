/**
 * curtain.tsx — the velvet curtain the VIP back room opens behind (STO-1170, design: VIP Loyalty
 * Ideas, "Velvet curtain"). Two panels and a valance; `open` slides them apart, `false` swings
 * them shut and calls `onClosed`. Reduced motion fades instead of sliding.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const VELVET = ["#5a0b16", "#8e1a2a", "#6a0f1c", "#8e1a2a", "#5a0b16"] as const;
const SWING_MS = 500;

/** Starts shut and opens on mount; flip `open` to false to close it again before leaving. */
export function Curtain({ open, onClosed }: { open: boolean; onClosed?: () => void }) {
  const reduceMotion = useReducedMotion();
  // 0 = shut, 1 = fully open.
  const progress = useSharedValue(0);

  useEffect(() => {
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !open && onClosed) runOnJS(onClosed)();
    };
    progress.set(withTiming(open ? 1 : 0, { duration: SWING_MS, easing: Easing.bezier(0.7, 0, 0.3, 1) }, done));
  }, [onClosed, open, progress]);

  const left = useAnimatedStyle(() =>
    reduceMotion ? { opacity: 1 - progress.get() } : { transform: [{ translateX: `${-102 * progress.get()}%` }] },
  );
  const right = useAnimatedStyle(() =>
    reduceMotion ? { opacity: 1 - progress.get() } : { transform: [{ translateX: `${102 * progress.get()}%` }] },
  );
  const valance = useAnimatedStyle(() =>
    reduceMotion ? { opacity: 1 - progress.get() } : { transform: [{ translateY: `${-110 * progress.get()}%` }] },
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="vip-curtain">
      <Animated.View style={[styles.panel, styles.left, left]}>
        <LinearGradient colors={VELVET} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.fringe} />
      </Animated.View>
      <Animated.View style={[styles.panel, styles.right, right]}>
        <LinearGradient colors={VELVET} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.fringe} />
      </Animated.View>
      <Animated.View style={[styles.valance, valance]}>
        <LinearGradient colors={["#8e1a2a", "#5a0b16"]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { bottom: 0, overflow: "hidden", position: "absolute", top: 0, width: "51%" },
  left: { left: 0 },
  right: { right: 0 },
  fringe: { backgroundColor: "#c9922f", bottom: 0, height: 6, left: 0, position: "absolute", right: 0 },
  valance: {
    borderBottomColor: "#c9922f",
    borderBottomWidth: 4,
    height: 46,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
});
