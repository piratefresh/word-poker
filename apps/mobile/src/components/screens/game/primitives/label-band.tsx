/**
 * label-band.tsx — the felt's small gold caption on a dark band that is solid under the words
 * and fades out toward either end, so it reads over any backdrop without a hard box. The
 * community rack's count and the HUD's phase title both wear it.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { ArcadeDigits } from "@/components/hud/top-bar/arcade-digits";
import { colors, fonts } from "@/constants/theme";

/** The dark band behind the label: solid under the text, fading out toward either end. */
const LABEL_SHADE = [
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0.55)",
  "rgba(0,0,0,0.55)",
  "rgba(0,0,0,0)",
] as const;

/** The band's padding around its words, at the caption's own size. */
export const LABEL_BAND_PAD = { horizontal: 40, vertical: 3 } as const;

export function LabelBand({
  children,
  style,
  textStyle,
}: {
  children: ReactNode;
  /** Overrides for the band, e.g. its padding scaled with what it hangs on. */
  style?: StyleProp<ViewStyle>;
  /** Overrides for the words, e.g. a size scaled with what they hang on. */
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <LinearGradient
      colors={LABEL_SHADE}
      end={{ x: 1, y: 0.5 }}
      locations={[0, 0.3, 0.7, 1]}
      start={{ x: 0, y: 0.5 }}
      style={[styles.band, style]}
    >
      <Text numberOfLines={1} style={[styles.label, textStyle]}>
        {children}
      </Text>
    </LinearGradient>
  );
}

/** The same fading band, with the clock's lettering for a numeric balance. */
export function ArcadeLabelBand({
  children,
  style,
  textStyle,
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <LinearGradient
      colors={LABEL_SHADE}
      end={{ x: 1, y: 0.5 }}
      locations={[0, 0.3, 0.7, 1]}
      start={{ x: 0, y: 0.5 }}
      style={[styles.band, style]}
    >
      <ArcadeDigits style={StyleSheet.flatten(textStyle)}>{children}</ArcadeDigits>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: LABEL_BAND_PAD.horizontal,
    paddingVertical: LABEL_BAND_PAD.vertical,
  },
  label: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.6,
  },
});
