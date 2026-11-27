import type { ReactElement, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SLOT_POWERS, powerCount, rowCount, type SlotSpellerState } from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, fontSize, spacing, type } from "@/constants/theme";

/** The shared title-and-body the end-of-round panels lay out in, inside the round sheet. */
export function OutcomeCard({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <View accessibilityLiveRegion="polite" style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export interface OutOfSpinsPanelProps {
  state: SlotSpellerState;
  onExtraSpin: () => void;
  onEndRun: () => void;
}

/** Out of spins short of the target: one Extra Spin a round if the tokens cover it, or end the run. */
export function OutOfSpinsPanel({ state, onExtraSpin, onEndRun }: OutOfSpinsPanelProps): ReactElement {
  const cost = state.config.extraSpinCost;
  const canBuy = !state.extraSpinUsed && state.tokens >= cost;
  return (
    <OutcomeCard title="Out of spins">
      <View style={styles.actions}>
        {canBuy ? (
          <GameButton label={`Extra spin · ${cost}`} variant="gold" onPress={onExtraSpin} testID="slot-extra-spin" />
        ) : null}
        <GameButton label="End run" variant="dark" onPress={onEndRun} testID="slot-end-run" />
      </View>
    </OutcomeCard>
  );
}

export interface RunOverPanelProps {
  state: SlotSpellerState;
  /** The device's records, drawn under the run's own summary. */
  records: ReactNode;
  onReplay: () => void;
  onNewRun: () => void;
}

/** The run's summary: how far it got, its best word and the build it ended with. */
export function RunOverPanel({ state, records, onReplay, onNewRun }: RunOverPanelProps): ReactElement {
  const held = SLOT_POWERS.filter((power) => powerCount(state.powers, power.id) > 0).map((power) => {
    const count = powerCount(state.powers, power.id);
    return count > 1 ? `${power.name} ×${count}` : power.name;
  });
  return (
    <OutcomeCard title="Run over">
      <Stat label="Round reached" value={`${state.round}`} />
      <Stat
        label="Best word"
        value={state.bestWord === null ? "–" : `${state.bestWord.word} · ${state.bestWord.score}`}
      />
      <Stat label="Build" value={`${state.reels} reels × ${rowCount(state.config, state.powers)} rows`} />
      <Stat label="Powers" value={held.length === 0 ? "None" : held.join(", ")} />
      <View style={styles.actions}>
        <GameButton label={`Replay seed ${state.seed}`} variant="dark" onPress={onReplay} testID="slot-replay-seed" />
        <GameButton label="New run" variant="gold" onPress={onNewRun} testID="slot-new-run" />
      </View>
      {records}
    </OutcomeCard>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { fontFamily: fonts.slab, fontSize: fontSize.title, color: colors.gold, textAlign: "center" },
  body: { ...type.body },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  stat: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  statLabel: { ...type.bodyDim },
  statValue: { ...type.body, flexShrink: 1, textAlign: "right", fontFamily: fonts.sansBold },
});
