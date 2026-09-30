/**
 * glass-button.tsx — the header's round glass controls and the glyphs they carry.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useScreenScale } from "@/components/screens/game/screen-scale";
import { border, colors, layout, opacity, radius } from "@/constants/theme";

import { GLASS_EDGE, GLASS_EDGE_SOFT, GLASS_FILL } from "./glass";

/** 30pt leading button, 28pt trailing pair. */
const GLASS_DIAMETER = { leading: 30, trailing: 28 } as const;

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

interface GlassButtonProps {
  label: string;
  onPress?: () => void;
  size: keyof typeof GLASS_DIAMETER;
  children: ReactNode;
}

export function GlassButton({ label, onPress, size, children }: GlassButtonProps) {
  const scale = useScreenScale();
  const diameter = GLASS_DIAMETER[size] * scale;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.glassButton,
        { height: diameter, width: diameter },
        size === "trailing" && styles.glassButtonTrailing,
        pressed && styles.pressed,
      ]}
    >
      {/* The glyph is drawn at the phone's size; a larger window grows it with the glass. */}
      {scale === 1 ? children : <View style={{ transform: [{ scale }] }}>{children}</View>}
    </Pressable>
  );
}

export function BackChevron() {
  return (
    <Svg fill="none" height={13} viewBox="0 0 9 13" width={9}>
      <Polyline
        points="7.4,1.2 1.6,6.5 7.4,11.8"
        stroke={colors.gold}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={border.thin}
      />
    </Svg>
  );
}

export function GearGlyph() {
  return (
    <Svg height={14} viewBox="0 0 14 14" width={14}>
      {GEAR_TEETH.map((tooth) => (
        <Line
          key={tooth.degrees}
          stroke={colors.gold}
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
        stroke={colors.gold}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glassButton: {
    alignItems: "center",
    backgroundColor: GLASS_FILL,
    borderColor: GLASS_EDGE,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    justifyContent: "center",
  },
  glassButtonTrailing: { borderColor: GLASS_EDGE_SOFT },
  pressed: { opacity: opacity.pressed },
});
