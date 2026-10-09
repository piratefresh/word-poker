/**
 * level-strip.tsx — the home screen's account level: an LVL badge, the XP bar, and the count
 * (STO-543). Presentational; the quests provider owns the numbers.
 *
 * Plain RN Views rather than `@expo/ui`: the bar is a two-layer fill (the coach card's track),
 * and `@expo/ui`'s `ProgressView` is SwiftUI-only — this renders on web and Android as-is, and
 * the home screen hosts it through `RNHostView` like its other RN content.
 */

import { StyleSheet, Text, View, type TextStyle } from "react-native";
import type { ReactElement } from "react";

import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

interface LevelStripProps {
  readonly level: number;
  /** XP earned into the level, and XP still needed — both whole numbers (`levelForXp`). */
  readonly intoLevel: number;
  readonly toNext: number;
  /** Points: SwiftUI hosts take frame sizes, not percentages (home-screen.tsx). */
  readonly width: number;
}

const badgeText = {
  color: colors.goldHi,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.small,
  letterSpacing: 1.2,
} as TextStyle;

const countText = {
  color: colors.textDim,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 0.5,
} as TextStyle;

export function LevelStrip({ level, intoLevel, toNext, width }: LevelStripProps): ReactElement {
  const span = intoLevel + toNext;
  const fill = span > 0 ? Math.max(0, Math.min(1, intoLevel / span)) : 0;

  return (
    <View
      accessibilityLabel={`Level ${level}, ${intoLevel} of ${span} XP toward level ${level + 1}`}
      accessible
      style={[styles.card, { width }]}
      testID="level-strip"
    >
      <Text style={badgeText}>{`LVL ${level}`}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fill * 100}%` }]} testID="level-strip-fill" />
      </View>
      <Text style={countText}>{`${intoLevel}/${span} XP`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fill: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    flexGrow: 1,
    height: "100%",
  },
  track: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    flex: 1,
    height: 8,
    overflow: "hidden",
  },
});
