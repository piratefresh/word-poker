import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  colors,
  duration,
  fonts,
  easing as motionEasing,
} from "@/constants/theme";

/** Where a block enters from, in points — the phase stamp's rise, in reverse. */
const ENTER_RISE = 8;
/** Squeezed in from a hair narrow, so a line reads as arriving rather than appearing. */
const ENTER_SCALE_X = 0.94;

export function BestWord({
  word,
  score,
  payout,
}: {
  word?: string;
  score?: number;
  payout: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // 1 is at rest: the block is legible on its first frame, and a renderer that never runs
  // an animation simply leaves it there.
  const rise = useSharedValue(1);
  const fade = useSharedValue(1);

  // Restarted by the word it announces, never by a mount: a pot change, a seat change or
  // a phase the table has nothing new to say about does not move this block.
  useEffect(() => {
    cancelAnimation(rise);
    cancelAnimation(fade);
    if (reduceMotion) {
      rise.set(1);
      fade.set(1);
      return;
    }
    rise.set(0);
    fade.set(0);
    rise.set(withSpring(1, motionEasing.springOvershoot));
    fade.set(withTiming(1, { duration: duration.phaseIn }));
  }, [word, payout, reduceMotion, rise, fade]);

  const entrance = useAnimatedStyle(() => ({
    opacity: interpolate(fade.get(), [0, 1], [0, 1]),
    transform: [
      { translateY: interpolate(rise.get(), [0, 1], [ENTER_RISE, 0]) },
      { scaleX: interpolate(rise.get(), [0, 1], [ENTER_SCALE_X, 1]) },
    ],
  }));

  // The block is the table's answer, not a placeholder: while the hand is being played and
  // there is no word yet, the spot above the rack belongs to the seat's own line — the word
  // builder draws its draft there — and a heading over an em dash is not information.
  if (!payout && word === undefined) return null;

  return (
    <Animated.View style={[styles.bestWord, entrance]}>
      <Text style={styles.bestWordLabel}>
        {payout ? "WINNING WORD" : "BEST WORD SO FAR"}
      </Text>
      <Text style={[styles.bestWordValue, payout && styles.winningWord]}>
        {word ?? "—"}
        {score ? (
          <Text style={styles.bestWordScore}>
            {" "}
            {"·"} {score}pts
          </Text>
        ) : null}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bestWord: { alignItems: "center", paddingBottom: 3, paddingTop: 7 },
  bestWordLabel: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  bestWordValue: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: 20,
    fontStyle: "italic",
    lineHeight: 25,
  },
  winningWord: { color: colors.goldHi },
  bestWordScore: { color: colors.gold, fontSize: 13, fontStyle: "normal" },
});
