/**
 * results-header.tsx — the bar over the results: the way back, and which hand just settled.
 *
 * The surface replaced the felt's payout band, and the back chevron the felt's HUD carried comes
 * with it (STO-379 decision 4): one 30pt control, sitting inside the safe-area inset so the
 * screen's modal does not draw a title under the status bar. `HAND #N · RESULTS` is centred by an
 * equal spacer on the other side rather than by absolute positioning, so the stamp stays on the
 * screen's centre line however tall the inset is.
 */

import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import {
  border,
  colors,
  fonts,
  fontSize,
  layout,
  ledger,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";

/** The control's diameter — the design's circle, and the spacer that centres the stamp. */
const CONTROL = 30;

export interface ResultsHeaderProps {
  /** The hand whose payout this screen shows, 1-based: the bar's `HAND #N`. */
  readonly hand: number;
  /** The back control's press: the screen's own exit, which the route owns. */
  readonly onBack: () => void;
}

export function ResultsHeader({
  hand,
  onBack,
}: ResultsHeaderProps): ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingLeft: Math.max(spacing.gutter, insets.left),
          paddingRight: Math.max(spacing.gutter, insets.right),
          paddingTop: insets.top + spacing.sm,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Back to the main menu"
        accessibilityRole="button"
        hitSlop={layout.hitSlop}
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        testID="results-back"
      >
        <BackChevron />
      </Pressable>

      <Text
        allowFontScaling
        style={styles.stamp}
      >{`HAND #${hand} · RESULTS`}</Text>

      {/* The circle's own width: with equal gaps either side, the stamp lands on centre. */}
      <View style={styles.spacer} />
    </View>
  );
}

/** The chevron, drawn rather than lettered — the design's own 9×13 stroke. */
function BackChevron(): ReactElement {
  return (
    <Svg fill="none" height={13} viewBox="0 0 9 13" width={9}>
      <Path
        d="M7 1L2 6.5L7 12"
        stroke={colors.gold}
        strokeLinecap="round"
        strokeWidth={border.thin}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.gutter,
    gap: spacing.sm,
  },
  back: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: CONTROL,
    justifyContent: "center",
    width: CONTROL,
  },
  backPressed: { opacity: opacity.pressed },
  spacer: { width: CONTROL },
  stamp: {
    color: ledger.onFelt,
    fontFamily: fonts.arcade,
    fontSize: fontSize.small,
    letterSpacing: 1,
  },
});
