import { useEffect, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { webTestID } from "@/lib/ui/web-id";

const RAISE_MS = 750;
export const LOWER_MS = 350;
/** The raise's beats: from below and tilted, overshoot, dip, settle a degree off true. */
const BEATS = [0, 0.55, 0.75, 1];
/** The first beat is a full window below, filled in once the window's height is known. */
const RISE_Y = [-14, 4, 0];
const RISE_DEG = [7, -2.5, -0.4, -1];

/**
 * The bouncer's clipboard: it rises from below when it mounts (the screen keys it per visit) and
 * drops when `lowered`. Reduced motion shows it settled and never moves it.
 */
export function ClipboardBoard({ lowered, children }: { lowered: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const below = useWindowDimensions().height;
  const riseY = [below, ...RISE_Y];
  const rise = useSharedValue(reduceMotion ? 1 : 0);
  const drop = useSharedValue(0);

  useEffect(() => {
    if (!reduceMotion) rise.value = withTiming(1, { duration: RAISE_MS, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, rise]);

  useEffect(() => {
    if (lowered && !reduceMotion) drop.value = withTiming(1, { duration: LOWER_MS, easing: Easing.bezier(0.5, 0, 0.9, 0.4) });
  }, [lowered, reduceMotion, drop]);

  const motion = useAnimatedStyle(() => {
    const y = interpolate(rise.value, BEATS, riseY) + drop.value * below;
    const deg = interpolate(rise.value, BEATS, RISE_DEG) + drop.value * 7;
    return { transform: [{ translateY: y }, { rotate: `${deg}deg` }] };
  });

  return (
    <Animated.View style={[styles.board, motion]} testID="friends-board" id={webTestID("friends-board")}>
      <View aria-hidden style={styles.clip}><View style={styles.clipSlot} /></View>
      <View style={styles.paper}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    transformOrigin: "50% 100%",
    borderRadius: 14,
    backgroundColor: "#93572e",
    borderTopWidth: 2,
    borderTopColor: "rgba(255,214,160,0.4)",
    boxShadow: "0px 14px 30px rgba(0,0,0,0.55)",
    paddingTop: 22,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  clip: {
    position: "absolute",
    zIndex: 1,
    top: -9,
    alignSelf: "center",
    width: 100,
    height: 30,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: "#c2c3c7",
    borderTopWidth: 2,
    borderTopColor: "#ffffff",
    boxShadow: "0px 3px 6px rgba(0,0,0,0.45)",
    alignItems: "center",
  },
  clipSlot: { marginTop: 5, width: 28, height: 9, borderRadius: 5, backgroundColor: "#5c5e64" },
  paper: { flex: 1, overflow: "hidden", borderRadius: 4, backgroundColor: "#fffdf6", boxShadow: "0px 2px 4px rgba(0,0,0,0.3)" },
});
