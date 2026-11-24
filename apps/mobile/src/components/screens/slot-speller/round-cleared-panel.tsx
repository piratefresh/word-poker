import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SlotSpellerState } from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { type } from "@/constants/theme";

import { OutcomeCard } from "./slot-outcome-panels";

export interface RoundClearedPanelProps {
  state: SlotSpellerState;
  onNextRound: () => void;
}

/** A cleared round, standing in for the shop (phase `shop`) until the shop UI replaces it. */
export function RoundClearedPanel({ state, onNextRound }: RoundClearedPanelProps): ReactElement {
  return (
    <OutcomeCard title="Round cleared">
      <Text style={type.body}>{`+${state.shop?.earned ?? 0} tokens · ${state.tokens} held`}</Text>
      <View style={styles.actions}>
        <GameButton label="Next round" variant="gold" onPress={onNextRound} testID="slot-next-round" />
      </View>
    </OutcomeCard>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row" },
});
