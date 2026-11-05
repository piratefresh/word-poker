import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";

import { ink, lilita } from "../chapter-map/chapter-map-ink";

/** The bar runs a little past ★★★, so the last star has room to be beaten. */
const OVERSHOOT = 8 / 7;

/**
 * The score of the word on the rack against the star goals: a bar that fills, with ticks at ★★ and
 * ★★★. A word that goes past the bar's end keeps it full.
 */
export function StoryMeter({ score, goals }: { score: number; goals: { two: number; three: number } }): ReactElement {
  const max = Math.round(goals.three * OVERSHOOT);
  const at = (points: number) => `${Math.min(100, (points / max) * 100)}%` as const;
  return (
    <View accessibilityLabel={`${score} points. ★★ at ${goals.two}, ★★★ at ${goals.three}.`} accessible style={styles.row} testID="story-meter">
      <Text style={styles.score}>
        {score}
        <Text style={styles.unit}> PTS</Text>
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: at(score) }]} />
        <Tick label={`★★ ${goals.two}`} left={at(goals.two)} />
        <Tick label={`★★★ ${goals.three}`} left={at(goals.three)} />
      </View>
    </View>
  );
}

function Tick({ label, left }: { label: string; left: `${number}%` }): ReactElement {
  return (
    <>
      <Text style={[styles.tickLabel, { left }]}>{label}</Text>
      <View style={[styles.tick, { left }]} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 20, paddingHorizontal: 12 },
  score: { color: ink.parchment, fontFamily: lilita, fontSize: 20, minWidth: 62, textShadowColor: "#5a2c14", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  unit: { fontSize: 12 },
  track: { backgroundColor: "rgba(60,28,10,0.55)", borderRadius: 999, flex: 1, height: 12 },
  fill: { backgroundColor: "#f0b84a", borderRadius: 999, bottom: 0, left: 0, position: "absolute", top: 0 },
  tick: { backgroundColor: ink.parchment, bottom: -2, marginLeft: -1, position: "absolute", top: -2, width: 2 },
  tickLabel: { color: ink.parchment, fontFamily: fonts.rubikSemiBold, fontSize: 11, position: "absolute", top: -19, transform: [{ translateX: -40 }], width: 80, textAlign: "center" },
});
