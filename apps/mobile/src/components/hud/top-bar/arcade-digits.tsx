/**
 * arcade-digits.tsx — the clock's digits as the plate's art wants them: a chunky arcade face
 * filled from sunlit yellow down to orange, with a hard shadow down and to the right, leaning
 * a touch forward.
 *
 * React Native text takes no gradient fill, so the lettering is an SVG laid
 * over the real text. The text stays in the tree, transparent: it sizes the digits, and it is
 * what a screen reader or a test finds.
 */

import { useId } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";

import { fonts } from "@/constants/theme";

/** The fill, top to bottom: calm is the plate's gold, loud runs hot. */
const CALM_FILL = ["#FFF1A0", "#FFC72C", "#F0821A"] as const;
const LOUD_FILL = ["#FFD0C0", "#FF7A5C", "#D23A26"] as const;
const SHADOW = "rgba(24, 8, 0, 0.8)";

/** The size the digits take with no style handed in. */
const DEFAULT_SIZE = 28;
/** Lilita One's digits stand about this share of the em tall. */
const DIGIT_HEIGHT = 0.7;
/** The outline's width and the shadow's drop, as shares of the font size. */
const OUTLINE_WIDTH = 0.1;
const SHADOW_DROP = 0.07;
/** The lean and the squeeze that turn the face from round to arcade. */
const LEAN = [{ skewX: "-4deg" }, { scaleX: 0.92 }] as const;

export function ArcadeDigits({
  children,
  loud = false,
  style,
}: {
  children: string;
  loud?: boolean;
  /** The digits' size, scaled with the banner they are lettered on. */
  style?: TextStyle;
}) {
  // Gradient ids share one document on the web, so each clock needs its own.
  const fillId = `arcade-fill-${useId().replace(/:/g, "")}`;
  const fontSize = style?.fontSize ?? DEFAULT_SIZE;
  const lineHeight = style?.lineHeight ?? fontSize * 1.2;
  const letterSpacing = style?.letterSpacing ?? 0;
  // The row centres the line box, so the digits sit centred on it: the baseline drops half their
  // height below the middle.
  const baseline = lineHeight / 2 + (fontSize * DIGIT_HEIGHT) / 2;
  const drop = fontSize * SHADOW_DROP;
  const pad = fontSize * OUTLINE_WIDTH;
  const fill = loud ? LOUD_FILL : CALM_FILL;

  const glyphs = {
    fontFamily: fonts.arcade,
    fontSize,
    letterSpacing,
    textAnchor: "middle",
    x: "50%",
  } as const;

  return (
    <View style={[styles.box, { paddingHorizontal: pad, transform: [...LEAN] }]}>
      <Text style={[styles.metric, style]}>{children}</Text>
      {/* Hidden from assistive tech: the transparent text is what gets read. */}
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
      {/* Sized outright: the web's SVG falls back to 300×150 without it. */}
      <Svg height="100%" width="100%" style={styles.svg}>
        <Defs>
          <LinearGradient
            gradientUnits="userSpaceOnUse"
            id={fillId}
            x1="0"
            x2="0"
            y1={baseline - fontSize * DIGIT_HEIGHT}
            y2={baseline}
          >
            <Stop offset="0" stopColor={fill[0]} />
            <Stop offset="0.45" stopColor={fill[1]} />
            <Stop offset="1" stopColor={fill[2]} />
          </LinearGradient>
        </Defs>
        {/* Back to front: the shadow, then the fill. */}
        <SvgText {...glyphs} dx={drop} fill={SHADOW} y={baseline + drop}>
          {children}
        </SvgText>
        <SvgText {...glyphs} fill={`url(#${fillId})`} y={baseline}>
          {children}
        </SvgText>
      </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "visible" },
  // The outline and the shadow reach past the digits' own box.
  svg: { overflow: "visible" },
  // Sized in the arcade face, so the SVG over it gets the room the digits really take.
  metric: {
    color: "transparent",
    fontFamily: fonts.arcade,
  },
});
