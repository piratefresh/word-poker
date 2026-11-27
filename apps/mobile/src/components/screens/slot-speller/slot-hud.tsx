import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SlotSpellerState } from "@wordpoker/game-rules";

import { colors, fonts, fontSize, radius, spacing, type } from "@/constants/theme";

export interface SlotHudProps {
  state: SlotSpellerState;
  /** The live grid's total while moving, drawn as a lighter fill past the score. */
  preview: number;
}

/** Round, target bar, spins, moves and tokens. */
export function SlotHud({ state, preview }: SlotHudProps): ReactElement {
  const { round, roundScore, target, spinsLeft, tokens, phase, moves, extraSpinUsed, config } = state;
  const moving = phase === "moving";
  const scoreFill = Math.min(roundScore / target, 1);
  const previewFill = Math.min((roundScore + (moving ? preview : 0)) / target, 1);
  const pips = config.spinsPerRound + (extraSpinUsed ? 1 : 0);

  return (
    <View style={styles.hud}>
      <View style={styles.row}>
        <Text style={styles.round}>{`Round ${round}`}</Text>
        <Text style={styles.score} testID="slot-score">
          {`${roundScore}`}
          {moving && preview > 0 ? <Text style={styles.preview}>{` (+${preview})`}</Text> : null}
          {` / ${target}`}
        </Text>
      </View>

      <View
        accessibilityLabel={`${roundScore} of ${target} points`}
        accessibilityRole="progressbar"
        style={styles.bar}
      >
        <View style={[styles.fill, styles.previewFill, { width: `${previewFill * 100}%` }]} />
        <View style={[styles.fill, { width: `${scoreFill * 100}%` }]} />
      </View>

      <View style={styles.row}>
        <View accessibilityLabel={`${spinsLeft} spins left`} style={styles.stat}>
          <Text style={styles.label}>SPINS</Text>
          <View style={styles.pips}>
            {Array.from({ length: pips }, (_, index) => (
              <View key={index} style={[styles.pip, index < spinsLeft && styles.pipOn]} />
            ))}
          </View>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>MOVES</Text>
          <Text style={styles.value}>{moving ? moves : "–"}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.label}>TOKENS</Text>
          <Text style={styles.value} testID="slot-tokens">
            {tokens}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  round: { fontFamily: fonts.ui, fontSize: fontSize.bodyLg, color: colors.textBright },
  score: { ...type.numeric, fontSize: fontSize.body },
  preview: { color: colors.successHi },
  bar: {
    height: 10,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
  },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.gold },
  previewFill: { backgroundColor: colors.success, opacity: 0.55 },
  stat: { alignItems: "center", gap: spacing.xxs },
  label: { ...type.label, fontSize: fontSize.micro },
  value: { fontFamily: fonts.ui, fontSize: fontSize.bodyLg, color: colors.textBright },
  pips: { flexDirection: "row", gap: spacing.xs, height: 18, alignItems: "center" },
  pip: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  pipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
