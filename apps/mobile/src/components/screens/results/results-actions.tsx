/**
 * results-actions.tsx — the two ways out of the results screen.
 *
 * `DEAL ANOTHER` is the gold primary and the only deal left on the table: the felt's payout
 * band used to carry one, and this replaced it (STO-379 decision 4). It is inert until the
 * entrance's clock settles, because the sequence is still landing on the numbers the primary
 * is asking the seat to leave behind — and it deals exactly once, so a double tap cannot take
 * a second hand (STO-383).
 *
 * The primary is a `Pressable` over a `LinearGradient` rather than a themed button, because a
 * native button cannot carry the gradient the design draws; `Main menu` is `@expo/ui`'s own
 * `Button`, which is what every other exit in the app already is (STO-379 decision 9).
 */

import { Button, Host } from "@expo/ui";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import {
  border,
  colors,
  fonts,
  fontSize,
  gradients,
  opacity,
  palette,
  radius,
  resultsEntrance,
  spacing,
} from "@/constants/theme";
import { beatProgress } from "./use-results-entrance";

export interface ResultsActionsProps {
  /** The entrance's shared clock: the row fades in on its own beat of it. */
  readonly clock: SharedValue<number>;
  /** Whether the sequence has settled — the primary's own gate. */
  readonly ready: boolean;
  readonly onDeal: () => void;
  readonly onExit: () => void;
}

export function ResultsActions({ clock, ready, onDeal, onExit }: ResultsActionsProps): ReactElement {
  const enter = useAnimatedStyle(() => ({
    opacity: beatProgress(clock, resultsEntrance.cta, resultsEntrance.ctaIn),
  }));

  return (
    <Animated.View style={[styles.row, enter]}>
      <Pressable
        accessibilityLabel="Deal another hand"
        accessibilityRole="button"
        // A disabled control is a fact about the screen, not only about its paint: the state
        // goes to the accessibility tree as well as to the fill.
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={onDeal}
        style={({ pressed }) => [
          styles.primary,
          !ready && styles.primaryDisabled,
          // The press is a scale, so the tap has a physical answer even while it is refused.
          pressed && ready && styles.primaryPressed,
        ]}
        testID="results-deal">
        <LinearGradient
          {...gradients.goldButton}
          end={{ x: 0.5, y: 1 }}
          start={{ x: 0.5, y: 0 }}
          style={styles.primaryFill}>
          <View pointerEvents="none" style={styles.primaryInset} />
          <Text style={styles.primaryLabel}>DEAL ANOTHER</Text>
        </LinearGradient>
      </Pressable>

      <Host colorScheme="dark" matchContents seedColor={colors.gold} style={styles.host}>
        <Button
          label="Main menu"
          onPress={onExit}
          testID="results-main-menu"
          variant="outlined"
        />
      </Host>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  primary: {
    borderRadius: radius.md,
    // The raised gold: a gold shadow under it, so the button sits above the felt.
    elevation: 6,
    flex: 1,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  primaryPressed: { transform: [{ scale: 0.97 }] },
  primaryDisabled: { opacity: opacity.disabled },
  primaryFill: {
    alignItems: "center",
    borderColor: palette.gold600,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    justifyContent: "center",
    // Clips the inset highlight to the rounded fill it belongs to.
    overflow: "hidden",
    paddingVertical: spacing.md,
  },
  primaryInset: {
    backgroundColor: "rgba(255,255,255,0.45)",
    height: border.hairline,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  primaryLabel: {
    color: colors.onGold,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
    letterSpacing: 1,
  },
  // `@expo/ui`'s host hugs its content; the row's own gap places it beside the primary.
  host: { alignSelf: "center" },
});
