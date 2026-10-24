import type { JSX } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";

import { colors, fonts, opacity } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

/**
 * The rack's word controls (shuffle, check): a dark wood pill with an amber rim and bright
 * lettering, so it reads as a button on the felt; dimmed when it cannot act.
 */
export function RackPill({
  label,
  disabled,
  onPress,
  scale,
  testID,
  accessibilityLabel,
  height,
  round = false,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  scale: number;
  testID: string;
  accessibilityLabel: string;
  /** Landscape's row: the pill stands a tile tall, and a `round` one is a disc that size. */
  height?: number;
  round?: boolean;
}): JSX.Element {
  const window = useWindowDimensions();
  // On its side the pills share a row with the rack and the bet buttons, so they run small.
  const landscape = window.width > window.height;
  const size = height ?? (landscape ? 28 : 30 * scale);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        // A tile-tall pill in landscape's row keeps its padding tight: the SE has 627 to share.
        { height: size, paddingHorizontal: round ? 0 : height ? 5 : landscape ? 10 : 16 * scale },
        round && { width: size },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      <Text style={[styles.label, { fontSize: landscape ? 10 : 12 * scale }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    backgroundColor: "#3b1d0e",
    borderColor: "#d98a3d",
    borderRadius: 999,
    borderWidth: 2,
    boxShadow: "0px 2px 3px rgba(0,0,0,0.45)",
    justifyContent: "center",
  },
  pressed: { backgroundColor: "#2a1409", transform: [{ translateY: 1 }] },
  disabled: { opacity: opacity.disabled },
  label: {
    color: colors.textBright,
    fontFamily: fonts.sansBlack,
    letterSpacing: 0.6,
  },
});
