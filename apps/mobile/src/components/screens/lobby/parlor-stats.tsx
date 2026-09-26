/**
 * parlor-stats.tsx — the rail under the masthead: the lobby's own ledger, a chip at a time.
 *
 * The design's rail reads a player's chips and their night's best words. None of that exists to
 * read yet — no wallet is wired into the app and no hand is summed anywhere — so the rail carries
 * what the listing genuinely knows: how many tables are listed, how many seats are free among
 * them, and how many are in the middle of a hand. A rail of real figures that move as tables open
 * and fill is worth more than a wallet's placeholder.
 *
 * It scrolls sideways without touching the screen's vertical scroll, and each chip is one element
 * to a screen reader rather than three fragments.
 */

import { type ReactElement } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  border,
  colors,
  fonts,
  fontSize,
  radius,
  spacing,
} from "@/constants/theme";
import type { ParlorStat } from "./parlor-view";

export interface ParlorStatsProps {
  readonly stats: readonly ParlorStat[];
}

export function ParlorStats({ stats }: ParlorStatsProps): ReactElement {
  return (
    <ScrollView
      contentContainerStyle={styles.rail}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="parlor-stats"
    >
      {stats.map((stat) => (
        <View
          accessibilityLabel={`${stat.label} ${stat.value}, ${stat.sub}`}
          accessibilityRole="text"
          accessible
          key={stat.key}
          style={styles.chip}
          testID={`parlor-stat-${stat.key}`}
        >
          <Text style={styles.label}>{stat.label}</Text>
          <Text numberOfLines={1} style={[styles.value, stat.accent && styles.valueAccent]}>
            {stat.value}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {stat.sub}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    gap: spacing.xxs,
    minWidth: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
  },
  value: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.bodyLg,
  },
  /** The chip the eye lands on first: the seat you hold, or the size of the room. */
  valueAccent: {
    color: colors.gold,
  },
  sub: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
  },
});
