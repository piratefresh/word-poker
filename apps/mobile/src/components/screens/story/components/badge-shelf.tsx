import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FRIENDS, KITCHEN_TABLE } from "@/features/story/kitchen-table-map";

import { gradient, ink, lilita } from "./chapter-map-ink";

/** One slot per boss; Chapter 1 has the Professor's. Fixed to the corner, over the scroll. */
export function BadgeShelf({ won, bottom }: { won: boolean; bottom: number }): ReactElement {
  return (
    <View
      accessibilityLabel={won ? `Badge shelf: ${KITCHEN_TABLE.badge}` : "Badge shelf, empty"}
      pointerEvents="none"
      style={[styles.shelf, { bottom }]}
      testID="story-badge-shelf"
    >
      <View style={styles.slot}>
        {won ? (
          <View style={styles.badge}>
            <View style={[styles.ribbon, { left: 12, backgroundColor: FRIENDS.jay.color, transform: [{ skewX: "12deg" }] }]} />
            <View style={[styles.ribbon, { right: 12, backgroundColor: FRIENDS.ellis.color, transform: [{ skewX: "-12deg" }] }]} />
            <View style={[styles.medal, gradient("radial-gradient(circle at 35% 30%, #ffe9a0, #e0a23a 65%, #b57a22)")]}>
              <Text style={styles.medalLetter}>P</Text>
            </View>
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyRing} />
          </View>
        )}
      </View>
      <View style={styles.board} />
      <Text numberOfLines={1} style={styles.label}>{won ? KITCHEN_TABLE.badge.toUpperCase() : "BADGE SHELF"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { position: "absolute", right: 6, width: 124, zIndex: 10, alignItems: "center" },
  slot: { width: 64, height: 58, alignItems: "center", justifyContent: "flex-end" },
  empty: {
    width: 56,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(247,231,181,0.55)",
    backgroundColor: "rgba(8,12,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: ink.slateLight, opacity: 0.5 },
  badge: { width: 50, height: 56, boxShadow: "0px 0px 14px rgba(255,210,110,0.7)", borderRadius: 25 },
  ribbon: { position: "absolute", top: 0, width: 10, height: 18 },
  medal: {
    position: "absolute",
    left: 3,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#fff1c0",
    alignItems: "center",
    justifyContent: "center",
  },
  medalLetter: { fontFamily: lilita, fontSize: 22, color: "#7a4a10" },
  board: {
    width: 104,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#8f5530",
    boxShadow: "0px 4px 0px #3a1c0c, 0px 8px 12px rgba(0,0,0,0.45)",
  },
  label: {
    marginTop: 8,
    fontFamily: lilita,
    fontSize: 11,
    letterSpacing: 0.7,
    color: ink.cream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(8,12,28,0.8)",
    overflow: "hidden",
  },
});
