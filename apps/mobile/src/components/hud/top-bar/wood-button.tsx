/**
 * wood-button.tsx — the header's round wooden controls and the glyphs they carry.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import { useScreenScale } from "@/components/screens/game/screen-scale";
import { border, layout, opacity, radius } from "@/constants/theme";

import { CAPSULE_HEIGHT } from "./banner";

const GLYPH = "#FFE7B0";
/** The capsule's height, which the discs ride level with. */
const DIAMETER = CAPSULE_HEIGHT;

interface WoodButtonProps {
  label: string;
  onPress?: () => void;
  children: ReactNode;
}

export function WoodButton({ label, onPress, children }: WoodButtonProps) {
  const scale = useScreenScale();
  const diameter = DIAMETER * scale;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.woodButton,
        { height: diameter, width: diameter },
        pressed && styles.pressed,
      ]}
    >
      {/* The glyph is drawn at the phone's size; a larger window grows it with the disc. */}
      {scale === 1 ? children : <View style={{ transform: [{ scale }] }}>{children}</View>}
    </Pressable>
  );
}

export function BackChevron() {
  return (
    <Svg fill="none" height={20} viewBox="0 0 9 13" width={14}>
      <Polyline
        points="7.4,1.2 1.6,6.5 7.4,11.8"
        stroke={GLYPH}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={border.thin}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  woodButton: {
    alignItems: "center",
    backgroundColor: "#6B3A17",
    borderColor: "#D98A2B",
    borderRadius: radius.pill,
    borderWidth: 3,
    boxShadow: "inset 0 0 0 2px #40200d, inset 0 2px 3px #e9a357, 0 3px 3px #30150790",
    justifyContent: "center",
  },
  pressed: { opacity: opacity.pressed },
});
