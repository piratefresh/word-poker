import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { KITCHEN_TABLE, discSize, type MapNode, type MapNodeState } from "@/features/story/kitchen-table-map";

import { NODE_COLUMN, gradient, ink, lilita } from "./chapter-map-ink";
import { NodePulse } from "./node-pulse";
import { Padlock } from "./padlock";

const LOOKS: Record<MapNodeState, { bg: string; edge: string; rim: string; fg: string }> = {
  completed: { bg: "radial-gradient(circle at 35% 30%, #8ee896, #2e9a4a 60%, #1f6e35)", edge: "#14502a", rim: "#e8f7d8", fg: "#ffffff" },
  available: { bg: "radial-gradient(circle at 35% 30%, #fff1b0, #ffc83d 55%, #d98a1c)", edge: ink.goldDeep, rim: ink.parchment, fg: "#4a2608" },
  locked: { bg: "radial-gradient(circle at 35% 30%, #5a6178, #373d52 60%, #262a3a)", edge: "#141725", rim: ink.slate, fg: "rgba(220,225,240,0.6)" },
};

export interface MapNodeButtonProps {
  node: MapNode;
  state: MapNodeState;
  stars: number;
  onPress: (node: MapNode) => void;
}

/** A node's disc, stars, name plate, and PLAY button; each state carries a shape cue, never colour alone. */
export function MapNodeButton({ node, state, stars, onPress }: MapNodeButtonProps): ReactElement {
  const size = discSize(node);
  const look = LOOKS[state];
  const locked = state === "locked";
  const available = state === "available";
  const label = `${node.title}, ${locked ? "locked" : available ? "play" : `completed, ${stars} of 3 stars`}`;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={() => onPress(node)}
      style={[styles.node, { left: node.x - NODE_COLUMN / 2, top: node.y - size / 2 }]}
      testID={`story-node-${node.id}`}
    >
      {node.kind === "boss" ? (
        <View style={[styles.threshold, { borderColor: locked ? "#9aa0b4" : ink.gold }]}>
          <Text style={[styles.thresholdText, { color: locked ? "#9aa0b4" : ink.gold }]}>{`BEAT ${KITCHEN_TABLE.threshold} PTS`}</Text>
        </View>
      ) : null}
      {available ? <NodePulse size={size} /> : null}
      <View
        style={[
          styles.disc,
          gradient(look.bg),
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: look.rim,
            boxShadow: `0px 6px 0px ${look.edge}, inset 0px -6px 10px rgba(0,0,0,0.25), inset 0px 6px 8px rgba(255,255,255,0.4), 0px 14px 18px rgba(0,0,0,0.45)`,
          },
        ]}
      >
        <Text style={[styles.glyph, { color: look.fg, fontSize: state === "completed" ? 34 : node.kind === "boss" ? 40 : 30 }]}>
          {state === "completed" ? "✓" : node.glyph}
        </Text>
        {locked ? <Padlock style={styles.discLock} /> : null}
      </View>
      <View style={styles.labels}>
        <View style={styles.starRow}>
          {[0, 1, 2].map((slot) => (
            <Text
              key={slot}
              style={[
                styles.star,
                slot < stars ? styles.starEarned : { color: locked ? "rgba(200,205,225,0.6)" : "rgba(255,240,210,0.8)" },
              ]}
            >
              {slot < stars ? "★" : "☆"}
            </Text>
          ))}
        </View>
        <Text
          style={[
            styles.plate,
            available
              ? { backgroundColor: ink.parchment, color: "#3a2210" }
              : { backgroundColor: locked ? "rgba(12,10,28,0.75)" : "rgba(12,10,28,0.85)", color: locked ? "#b4bacd" : ink.cream },
          ]}
        >
          {node.title}
        </Text>
        {node.kind === "bonus" ? <Text style={styles.bonusTag}>OPTIONAL · STARS ONLY</Text> : null}
        {available ? (
          <LinearGradient colors={["#ffe27a", "#ffc83d", "#e8a42a"]} style={styles.play}>
            <Text style={styles.playText}>PLAY</Text>
          </LinearGradient>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  node: { position: "absolute", width: NODE_COLUMN, alignItems: "center", zIndex: 3 },
  disc: { borderWidth: 4, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: lilita, textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  discLock: { position: "absolute", right: -8, bottom: -6 },
  threshold: {
    position: "absolute",
    top: -38,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: ink.plum,
    boxShadow: "0px 3px 0px rgba(0,0,0,0.35)",
  },
  thresholdText: { fontFamily: lilita, fontSize: 13, letterSpacing: 0.65 },
  labels: { marginTop: 10, alignItems: "center", gap: 4 },
  starRow: { flexDirection: "row", gap: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(10,8,24,0.72)" },
  star: { fontFamily: fonts.rubik, fontSize: 16, lineHeight: 18 },
  starEarned: { color: ink.gold, textShadowColor: ink.goldDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  plate: { fontFamily: lilita, fontSize: 13, lineHeight: 16, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  bonusTag: {
    fontFamily: lilita,
    fontSize: 10,
    letterSpacing: 0.8,
    color: ink.cream,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(247,231,181,0.7)",
  },
  play: {
    minWidth: 88,
    height: 34,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ink.parchment,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0px 4px 0px ${ink.goldDeep}, 0px 8px 12px rgba(0,0,0,0.4)`,
  },
  playText: { fontFamily: lilita, fontSize: 17, letterSpacing: 1, color: "#4a2608", textShadowColor: "rgba(255,246,226,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
