/**
 * phase-capsule.tsx — the wooden capsule: `FLOP | ⏱ 0:28`. Three image slices, the middle one
 * stretching to whatever the label needs; the label is in flow and the slices hang behind it,
 * so the longest words never clip.
 */

import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useCompactControls, useScreenScale } from "@/components/screens/game/screen-scale";
import { colors, fonts } from "@/constants/theme";

import type { TurnTimerView } from "../turn-clock";
import { BannerClock } from "./banner-clock";
import { CAPSULE_HEIGHT } from "./banner";

// Relative, not `@/assets`: Jest maps `@/` to `src/` only.
const LEFT = require("../../../../assets/images/ui/v2/phase-capsule-left.png");
const MIDDLE = require("../../../../assets/images/ui/v2/phase-capsule-middle.png");
const RIGHT = require("../../../../assets/images/ui/v2/phase-capsule-right.png");

/** The end slices are cropped to their curve: a cap is this share of the capsule's height wide. */
const CAP_RATIO = 0.8;
const PHASE_SIZE = 15;
const CLOCK_SIZE = {
  fontSize: 17,
  lineHeight: 22,
  letterSpacing: 0.5,
} as const;
/** The wood rail's thickness as a share of the capsule's height. */
const RAIL = 0.17;
const YELLOW = "#FFC72C";

export function PhaseCapsule({
  label,
  turn,
  phrase,
  loopsEnabled,
  reduceMotion,
  showClock = true,
}: {
  label: string;
  turn: TurnTimerView | null;
  phrase?: string;
  loopsEnabled: boolean;
  reduceMotion: boolean;
  /** The waiting table names itself in the capsule and runs no clock. */
  showClock?: boolean;
}) {
  const scale = useScreenScale();
  const compact = useCompactControls();
  const height = CAPSULE_HEIGHT * scale;
  const cap = height * CAP_RATIO;
  const art = { height, position: "absolute", top: 0 } as const;
  return (
    <View style={{ height, paddingHorizontal: cap * 0.7 }}>
      <Image
        accessible={false}
        contentFit="cover"
        contentPosition="left"
        source={LEFT}
        style={[art, { left: 0, width: cap }]}
      />
      <Image
        accessible={false}
        contentFit="fill"
        source={MIDDLE}
        style={[art, { left: cap, right: cap }]}
      />
      <Image
        accessible={false}
        contentFit="cover"
        contentPosition="right"
        source={RIGHT}
        style={[art, { right: 0, width: cap }]}
      />
      {/* The felt-green inlay: the wood's dark interior is hard to read gold on. */}
      <View
        style={[styles.inlay, { borderRadius: height, inset: height * RAIL }]}
      />
      <View style={styles.row}>
        <Text
          numberOfLines={1}
          style={[
            styles.phase,
            { fontSize: (compact ? 12 : PHASE_SIZE) * scale, lineHeight: height * 0.6 },
          ]}
        >
          {label}
        </Text>
        {showClock ? (
          <>
            <View style={[styles.divider, { height: height * 0.4 }]} />
            <Svg height={18 * scale} viewBox="0 0 18 18" width={18 * scale}>
              <Line
                stroke={YELLOW}
                strokeLinecap="round"
                strokeWidth={2}
                x1={7}
                x2={11}
                y1={1.5}
                y2={1.5}
              />
              <Circle
                cx={9}
                cy={10}
                fill={YELLOW}
                r={7}
                stroke="#8A5A00"
                strokeWidth={1}
              />
              <Circle cx={9} cy={10} fill="#FFF3C4" r={5} />
              <Polyline
                fill="none"
                points="9,6.5 9,10 11.5,11.5"
                stroke="#8A5A00"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.4}
              />
            </Svg>
            <BannerClock
              clockStyle={{
                fontSize: (compact ? 14 : CLOCK_SIZE.fontSize) * scale,
                lineHeight: CLOCK_SIZE.lineHeight * scale,
                letterSpacing: CLOCK_SIZE.letterSpacing * scale,
              }}
              loopsEnabled={loopsEnabled}
              phrase={phrase}
              reduceMotion={reduceMotion}
              turn={turn}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlay: {
    backgroundColor: "#1E5A33",
    borderColor: "#123A21",
    borderWidth: 1.5,
    position: "absolute",
  },
  row: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  phase: {
    color: colors.textBright,
    fontFamily: fonts.arcade,
    letterSpacing: 0.5,
  },
  divider: { backgroundColor: "#E0B33A", width: 1.5 },
});
