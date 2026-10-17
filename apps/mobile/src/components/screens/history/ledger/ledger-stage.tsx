import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { BookCover } from "./book-cover";

const DROP = Easing.bezier(.3, 1.25, .5, 1);
const SWING = Easing.bezier(.5, .05, .25, 1);
const HOME = Easing.bezier(.3, .7, .2, 1);

/** Home never unmounts; only the ledger's pages reset after a completed close. */
export function LedgerStage({ open, home, children }: { open: boolean; home: ReactNode; children: ReactNode }) {
  const reduced = useReduceMotion();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [closed, setClosed] = useState(!open);
  if (open && closed) setClosed(false);
  else if (!open && reduced && !closed) setClosed(true);
  const visible = open || (!reduced && !closed);
  const [pastSpine, setPastSpine] = useState(false);
  const readable = reduced ? open : pastSpine;
  const drop = useSharedValue(0);
  const angle = useSharedValue(0);
  const dim = useSharedValue(0);
  const scale = useSharedValue(1);

  useAnimatedReaction(() => angle.value < -90, (next, previous) => {
    if (next !== previous) runOnJS(setPastSpine)(next);
  });

  useEffect(() => {
    // Cancel delays as well as active motion before assigning a new destination.
    for (const value of [drop, angle, dim, scale]) cancelAnimation(value);
    if (reduced) {
      drop.value = open ? 1 : 0;
      angle.value = open ? -176 : 0;
      dim.value = 0;
      scale.value = 1;
    } else {
      const freshOpen = open && drop.value === 0 && angle.value === 0;
      dim.value = withTiming(open ? 1 : 0, { duration: 500, easing: HOME });
      scale.value = withTiming(open ? .96 : 1, { duration: 600, easing: HOME });
      angle.value = withDelay(freshOpen ? 550 : 0, withTiming(open ? -176 : 0, { duration: 800, easing: SWING }));
      drop.value = withDelay(open ? 0 : 600, withTiming(open ? 1 : 0, { duration: 650, easing: DROP }, (finished) => {
        if (finished && !open) runOnJS(setClosed)(true);
      }));
    }
    return () => {
      for (const value of [drop, angle, dim, scale]) cancelAnimation(value);
    };
  }, [open, reduced, drop, angle, dim, scale]);

  const homeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const bookStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - drop.value) * -Math.max(920, size.height + 108) }, { rotate: `${(1 - drop.value) * -6}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1600 }, { translateX: -size.width / 2 }, { rotateY: `${angle.value}deg` }, { translateX: size.width / 2 }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1600 }, { translateX: -size.width / 2 }, { rotateY: `${angle.value}deg` }, { translateX: size.width / 2 }, { rotateY: "180deg" }],
  }));

  return (
    <View style={styles.stage} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      <Animated.View testID="ledger-home" pointerEvents={open ? "none" : "auto"} aria-hidden={open} accessibilityElementsHidden={open} importantForAccessibility={open ? "no-hide-descendants" : "auto"} style={[StyleSheet.absoluteFill, homeStyle]}>{home}</Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
      <Animated.View testID="ledger-book" pointerEvents={visible ? "auto" : "none"} aria-hidden={!open || !readable} accessibilityElementsHidden={!open || !readable} importantForAccessibility={open && readable ? "auto" : "no-hide-descendants"} style={[StyleSheet.absoluteFill, styles.book, !visible && styles.hidden, bookStyle]}>
        <LinearGradient colors={["#3b1a0b", "#5e2d15", "#4a220f"]} locations={[0, .08, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, styles.body]} />
        <View pointerEvents="none" style={styles.edges}>{Array.from({ length: 8 }, (_, i) => <View key={i} style={{ width: 1, backgroundColor: i % 2 ? "#cdb88e" : "#efe2c4" }} />)}</View>
        <View testID="ledger-pages" pointerEvents={open && readable ? "auto" : "none"} style={styles.pages}>{visible ? children : null}</View>
        <Animated.View testID="ledger-cover-front" pointerEvents="none" style={[styles.cover, frontStyle]}><BookCover /></Animated.View>
        <Animated.View testID="ledger-cover-back" pointerEvents="none" style={[styles.cover, backStyle]}><BookCover inside /></Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  dim: { backgroundColor: "rgba(5,7,15,.62)" },
  book: { boxShadow: "0px 18px 36px rgba(0,0,0,.6)" },
  body: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  hidden: { opacity: 0 },
  edges: { position: "absolute", top: 8, bottom: 10, right: 4, width: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, overflow: "hidden", flexDirection: "row" },
  pages: { position: "absolute", top: 6, bottom: 8, left: 8, right: 10 },
  cover: { ...StyleSheet.absoluteFill, backfaceVisibility: "hidden" },
});
