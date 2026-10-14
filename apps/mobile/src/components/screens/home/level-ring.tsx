import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, fonts, fontSize } from "@/constants/theme";

interface LevelRingProps {
  readonly level: number;
  readonly intoLevel: number;
  readonly toNext: number;
}

const SIZE = 52;
const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function LevelRing({ level, intoLevel, toNext }: LevelRingProps) {
  const span = intoLevel + toNext;
  const fill = span > 0 ? Math.max(0, Math.min(1, intoLevel / span)) : 0;

  return (
    <View
      accessibilityLabel={`Level ${level}, ${intoLevel} of ${span} XP toward level ${level + 1}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: span, now: intoLevel }}
      accessible
      style={styles.ring}
      testID="level-ring"
    >
      <Svg height={SIZE} style={StyleSheet.absoluteFill} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} fill={colors.surface} r={RADIUS} stroke={colors.borderStrong} strokeWidth={3} />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          fill="none"
          opacity={fill > 0 ? 1 : 0}
          r={RADIUS}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          stroke={colors.gold}
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
          strokeLinecap="round"
          strokeWidth={3}
          testID="level-ring-fill"
        />
      </Svg>
      <Text style={styles.label}>Lvl</Text>
      <Text style={styles.level}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  label: { color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.micro },
  level: { color: colors.goldHi, fontFamily: fonts.ui, fontSize: fontSize.title, lineHeight: 23 },
});
