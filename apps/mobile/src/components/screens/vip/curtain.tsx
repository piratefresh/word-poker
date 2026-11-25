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

const SWING_MS = 500;
/** One velvet fold: dark in the crease, lit on the crown — the design's 34px stripe, softened. */
const FOLD = 34;
const FOLD_COLORS = ["#5a0b16", "#8e1a2a", "#8e1a2a", "#6a0f1c"] as const;
const FOLD_STOPS = [0, 0.3, 0.65, 1] as const;
const MAX_FOLDS = 40;

/** A curtain panel: folds across, shaded toward the wall, a shadow where the two meet, a gold fringe. */
function Panel({ side }: { side: "left" | "right" }) {
  const outer = side === "left" ? { x: 0, y: 0 } : { x: 1, y: 0 };
  const inner = side === "left" ? { x: 1, y: 0 } : { x: 0, y: 0 };
  return (
    <>
      <View style={[styles.folds, side === "right" && styles.foldsRight]}>
        {Array.from({ length: MAX_FOLDS }, (_, i) => (
          <LinearGradient colors={FOLD_COLORS} end={{ x: 1, y: 0 }} key={i} locations={FOLD_STOPS} start={{ x: 0, y: 0 }} style={styles.fold} />
        ))}
      </View>
      {/* Toward the wall the velvet falls into shadow; the last third is lit. */}
      <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} end={inner} locations={[0, 0.3]} start={outer} style={StyleSheet.absoluteFill} />
      {/* Where the two panels meet, a soft inner shadow. */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.5)"]}
        end={inner}
        start={outer}
        locations={[0.88, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* A faint sheen down the folds' length, so the velvet reads as cloth, not stripes. */}
      <LinearGradient colors={["rgba(255,220,200,0.08)", "transparent", "rgba(0,0,0,0.25)"]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.fringe} />
      <View style={styles.tassels}>
        {Array.from({ length: MAX_FOLDS }, (_, i) => (
          <View key={i} style={styles.tassel} />
        ))}
      </View>
    </>
  );
}

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
        <Panel side="left" />
      </Animated.View>
      <Animated.View style={[styles.panel, styles.right, right]}>
        <Panel side="right" />
      </Animated.View>
      <Animated.View style={[styles.valance, valance]}>
        <View style={[styles.folds, styles.valanceFolds]}>
          {Array.from({ length: MAX_FOLDS * 2 }, (_, i) => (
            <LinearGradient colors={FOLD_COLORS} end={{ x: 1, y: 0 }} key={i} locations={FOLD_STOPS} start={{ x: 0, y: 0 }} style={styles.valanceFold} />
          ))}
        </View>
        <LinearGradient colors={["rgba(255,220,200,0.12)", "rgba(0,0,0,0.35)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.valanceTrim} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { bottom: 0, overflow: "hidden", position: "absolute", top: 0, width: "51%" },
  left: { left: 0 },
  right: { right: 0 },
  folds: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, flexDirection: "row" },
  foldsRight: { flexDirection: "row-reverse" },
  fold: { height: "100%", width: FOLD },
  fringe: { backgroundColor: "#c9922f", bottom: 6, height: 4, left: 0, position: "absolute", right: 0 },
  tassels: { bottom: 0, flexDirection: "row", height: 6, left: 0, position: "absolute", right: 0 },
  tassel: { backgroundColor: "#a87624", borderBottomLeftRadius: 3, borderBottomRightRadius: 3, height: 6, marginRight: 4, width: 6 },
  valance: {
    boxShadow: "0px 6px 10px rgba(0, 0, 0, 0.4)",
    height: 46,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  valanceFolds: { overflow: "hidden" },
  valanceFold: { height: "100%", width: FOLD / 2 },
  valanceTrim: { backgroundColor: "#c9922f", bottom: 0, height: 4, left: 0, position: "absolute", right: 0 },
});
