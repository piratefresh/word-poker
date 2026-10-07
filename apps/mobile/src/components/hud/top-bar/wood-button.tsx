/**
 * wood-button.tsx — the header's round wooden controls and the glyphs they carry.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useScreenScale } from "@/components/screens/game/screen-scale";
import { border, layout, opacity, radius } from "@/constants/theme";

import { CAPSULE_HEIGHT } from "./banner";

const GLYPH = "#FFE7B0";
/** The capsule's height, which the discs ride level with. */
const DIAMETER = CAPSULE_HEIGHT;

/** Eight teeth is the least that still reads as a cog at 14pt. */
const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    degrees,
    x1: 7 + cos * 4.2,
    y1: 7 + sin * 4.2,
    x2: 7 + cos * 6.2,
    y2: 7 + sin * 6.2,
  };
});

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

export function GearGlyph() {
  return (
    <Svg height={20} viewBox="0 0 14 14" width={20}>
      {GEAR_TEETH.map((tooth) => (
        <Line
          key={tooth.degrees}
          stroke={GLYPH}
          strokeLinecap="round"
          strokeWidth={1.4}
          x1={tooth.x1}
          x2={tooth.x2}
          y1={tooth.y1}
          y2={tooth.y2}
        />
      ))}
      <Circle
        cx={7}
        cy={7}
        fill="none"
        r={4.2}
        stroke={GLYPH}
        strokeWidth={1.4}
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
