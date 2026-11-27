import { BottomSheet, RNHostView } from "@expo/ui";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SlotEvaluation, SlotSpellerState, SlotWord } from "@wordpoker/game-rules";

import { colors, fontSize, palette, radius, spacing, type } from "@/constants/theme";

export interface SlotRoundSheetProps {
  open: boolean;
  state: SlotSpellerState;
  /** The spin that ended the round, for the result line. */
  payout: SlotEvaluation | null;
  onDismiss: () => void;
  /** The phase's panel: the shop, Out of spins, or Run over. */
  children: ReactNode;
}

/** The end of a round in a sheet: how it went on top, then what comes next (shop, extra spin, run summary). */
export function SlotRoundSheet({ open, state, payout, onDismiss, children }: SlotRoundSheetProps): ReactElement {
  return (
    <BottomSheet containerColor={palette.felt800} isPresented={open} onDismiss={onDismiss} testID="slot-round-sheet">
      <RNHostView matchContents>
        <View style={styles.sheet}>
          {state.phase === "over" ? null : <RoundResult state={state} payout={payout} />}
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

/** The round's score against its target, and what the last spin paid. */
function RoundResult({ state, payout }: { state: SlotSpellerState; payout: SlotEvaluation | null }): ReactElement {
  const { roundScore, target } = state;
  const cleared = roundScore >= target;
  const top = payout?.words.reduce<SlotWord | null>(
    (best, word) => (best === null || word.breakdown.score > best.breakdown.score ? word : best),
    null,
  );
  return (
    <View accessibilityLabel={`${roundScore} of ${target} points`} style={styles.result}>
      <Text style={[styles.score, { color: cleared ? colors.goldHi : colors.textBright }]} testID="slot-sheet-score">
        {`${roundScore}`}
        <Text style={styles.target}>{` / ${target}`}</Text>
      </Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${Math.min(roundScore / target, 1) * 100}%` }, !cleared && styles.fillShort]} />
      </View>
      {payout !== null ? (
        <Text style={styles.dim}>
          {`Last spin +${payout.total}`}
          {top ? ` · best word ${top.word} ${top.breakdown.score}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { alignSelf: "stretch", width: "100%", gap: spacing.lg, paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xl },
  result: { alignItems: "center", gap: spacing.xs },
  score: { ...type.numeric, fontSize: fontSize.display },
  target: { color: colors.textDim, fontSize: fontSize.title },
  bar: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
  },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.gold },
  fillShort: { backgroundColor: colors.danger },
  dim: { ...type.bodyDim, fontSize: fontSize.small, textAlign: "center" },
});
