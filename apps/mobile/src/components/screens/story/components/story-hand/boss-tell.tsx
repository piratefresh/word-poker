import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BossTell as Tell, TellKind } from "@wordpoker/game-rules";

import { border, colors, fonts, spacing } from "@/constants/theme";
import { bossName } from "@/features/story/bosses";

const METER: Readonly<Record<TellKind, { label: string; states: readonly string[] }>> = {
  pressure: { label: "PRESSURE", states: ["calm", "warm", "sweating", "fidgeting", "bar full"] },
  "vowel-jar": { label: "VOWEL JAR", states: ["empty", "half full", "full"] },
  "chip-stack": { label: "CHIP STACK", states: ["neat", "uneven", "messy", "a mess"] },
  glint: { label: "RARE TILES", states: ["no glint", "glinting ✦"] },
};

/**
 * A boss's tell over the felt (STO-974): a row of pips — filled or hollow, so it reads without
 * colour — and the word for how full it is. The reading is game-rules' `bossTells`.
 */
export function BossTell({ tell }: { tell: Tell }): ReactElement {
  const meter = METER[tell.kind];
  const state = meter.states[Math.min(tell.level, meter.states.length - 1)] ?? "";
  const who = bossName(tell.boss);
  return (
    <View
      accessible
      accessibilityLabel={`${who}'s ${meter.label.toLowerCase()}: ${state}, ${tell.level} of ${tell.max}`}
      style={styles.row}
      testID="boss-tell"
    >
      <Text style={styles.label}>{`${who.toUpperCase()} · ${meter.label}`}</Text>
      <View style={styles.pips}>
        {Array.from({ length: tell.max }, (_, index) => (
          <View key={index} style={[styles.pip, index < tell.level ? styles.filled : null]} />
        ))}
      </View>
      <Text style={styles.state}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  label: { color: colors.gold, fontFamily: fonts.mono, fontSize: 11 },
  pips: { flexDirection: "row", gap: 3 },
  pip: { borderColor: colors.gold, borderRadius: 2, borderWidth: border.hairline * 2, height: 10, width: 14 },
  filled: { backgroundColor: colors.gold },
  state: { color: colors.textBright, fontFamily: fonts.mono, fontSize: 12 },
});
