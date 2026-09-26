/**
 * gold-button.tsx — the design's gold primary: a pill of brass on the felt.
 *
 * It is a `Pressable` over a `LinearGradient` rather than a themed button, for the reason
 * `results-actions` rolls its own primary: a native button cannot carry the gradient the design
 * draws. The inset highlight is a one-pixel view across the top of the gradient, which is what
 * gives the pill its struck-metal edge, and the drop is the theme's own elevation.
 *
 * The label, the icon and the press are the whole surface. Whether the button does anything is the
 * caller's: a disabled primary is drawn flat, keeps its label, and swallows no taps.
 */

import { LinearGradient } from "expo-linear-gradient";
import { type ReactElement } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { haptic } from "@/components/word-builder/haptics";
import {
  border,
  colors,
  elevation,
  fonts,
  fontSize,
  gradients,
  opacity,
  palette,
  radius,
  spacing,
} from "@/constants/theme";

export interface GoldButtonProps {
  label: string;
  onPress: () => void;
  /** A plus, drawn in the button's own ink — the "make one" mark the design puts on both CTAs. */
  icon?: "plus";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function GoldButton({
  label,
  onPress,
  icon,
  disabled = false,
  style,
  testID,
  accessibilityLabel,
}: GoldButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        // The tap that takes a seat or opens the deal: a soft knock, not a win.
        haptic("settle");
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      <LinearGradient
        colors={gradients.goldButton.colors}
        end={gradients.goldButton.end}
        start={gradients.goldButton.start}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.highlight} />
      {icon === undefined ? null : <Plus />}
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The plus in the design's CTA: two strokes, in the ink the label is set in. */
function Plus(): ReactElement {
  return (
    <Svg height={12} viewBox="0 0 12 12" width={12}>
      <Path
        d="M6 1v10M1 6h10"
        fill="none"
        stroke={colors.onGold}
        strokeLinecap="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  pill: {
    ...elevation.card,
    alignItems: "center",
    backgroundColor: palette.gold300,
    borderColor: palette.gold600,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  /** The struck edge: a hair of light along the top of the gradient. */
  highlight: {
    backgroundColor: "rgba(255,255,255,0.4)",
    height: border.hairline,
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
    top: 0,
  },
  label: {
    color: colors.onGold,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
    letterSpacing: 1,
  },
});
