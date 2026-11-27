import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SLOT_POWERS, type SlotEvaluation } from "@wordpoker/game-rules";

import { colors, fonts, fontSize, radius, spacing, type } from "@/constants/theme";
import type { SlotPayoutRow } from "@/features/slot-speller/slot-speller-model";

export interface SlotPayoutListProps {
  payout: SlotEvaluation;
  /** The rows revealed so far, in order. */
  rows: readonly SlotPayoutRow[];
  /** What each triggered Scoring power multiplied a word by. */
  powerMultiplier: number;
}

/** The paid spin, line by line: each word's breakdown, the powers it triggered, the total. */
export function SlotPayoutList({ payout, rows, powerMultiplier }: SlotPayoutListProps): ReactElement {
  return (
    <View accessibilityLiveRegion="polite" style={styles.list} testID="slot-payout">
      {rows.map((row) => {
        if (row.kind === "total") {
          return (
            <View key="total" style={[styles.row, styles.total]}>
              <Text style={styles.totalLabel}>{payout.words.length === 0 ? "No words paid" : "Spin total"}</Text>
              <Text style={styles.totalScore}>{`+${row.total}`}</Text>
            </View>
          );
        }
        const word = payout.words[row.index];
        if (word === undefined) return null;
        if (row.kind === "power") {
          const name = SLOT_POWERS.find((power) => power.id === row.power)?.name ?? row.power;
          return (
            <View key={`${row.index}-${row.power}`} style={[styles.row, styles.power]}>
              <Text style={styles.powerText}>{`⚡ ${name}`}</Text>
              <Text style={styles.powerText}>{`×${powerMultiplier}`}</Text>
            </View>
          );
        }
        const { base, lengthMult, notes, score } = word.breakdown;
        return (
          <View key={`word-${row.index}`} style={styles.row}>
            <View style={styles.wordBlock}>
              <Text style={styles.word}>{word.word}</Text>
              <Text style={styles.detail}>
                {[word.line, `${base}×${lengthMult}`, ...notes].join(" · ")}
              </Text>
            </View>
            <Text style={styles.score}>{score}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  wordBlock: { flex: 1, minWidth: 0 },
  word: { fontFamily: fonts.ui, fontSize: fontSize.bodyLg, letterSpacing: 1, color: colors.goldHi },
  detail: { ...type.bodyDim, fontSize: fontSize.caption, lineHeight: 15 },
  score: { ...type.numeric },
  power: { paddingLeft: spacing.lg },
  powerText: { fontFamily: fonts.uiMedium, fontSize: fontSize.small, color: colors.warning },
  total: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontFamily: fonts.ui, fontSize: fontSize.body, color: colors.textBright },
  totalScore: { ...type.numeric, fontSize: fontSize.title },
});
