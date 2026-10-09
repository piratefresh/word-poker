import { LinearGradient } from "expo-linear-gradient";
import { useEffect, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export const XP_BAR_ASPECT = 8;
const STRIPES = Array.from({ length: 16 }, (_, index) => index);

/** A compact gold meter with a dark wood well; shared by native and web. */
export function XpBar({ progress, reducedMotion }: { progress: number; reducedMotion: boolean }): ReactElement {
  const target = Math.max(0, Math.min(100, progress));
  const fill = useSharedValue(target);
  useEffect(() => {
    fill.set(reducedMotion ? target : withTiming(target, { duration: 400, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(fill);
  }, [fill, reducedMotion, target]);
  const animatedFill = useAnimatedStyle(() => ({ width: `${fill.get()}%` }));

  return (
    <LinearGradient colors={["#ffe38a", "#f6a52a", "#87400d"]} style={styles.frame}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, animatedFill]}>
          <LinearGradient colors={["#fff75c", "#ffcf00", "#ffad00"]} style={StyleSheet.absoluteFill} />
          <View style={styles.stripes}>
            {STRIPES.map((stripe) => <View key={stripe} style={styles.stripe} />)}
          </View>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFill, padding: 5, borderRadius: 999, borderWidth: 1, borderColor: "#6c2e07",
    boxShadow: "0px 4px 5px rgba(49, 17, 2, 0.65)",
  },
  track: {
    flex: 1, borderRadius: 999, overflow: "hidden", backgroundColor: "#492006",
    borderWidth: 1.5, borderColor: "#ffe198", boxShadow: "inset 0px 3px 5px rgba(20, 5, 0, 0.7)",
  },
  fill: { height: "100%", borderRadius: 999, overflow: "hidden", borderWidth: 1.5, borderColor: "#fff498" },
  stripes: { ...StyleSheet.absoluteFill, flexDirection: "row", gap: 18 },
  stripe: { width: 16, height: "180%", marginTop: -10, backgroundColor: "rgba(255, 255, 205, 0.22)", transform: [{ rotate: "35deg" }] },
});
