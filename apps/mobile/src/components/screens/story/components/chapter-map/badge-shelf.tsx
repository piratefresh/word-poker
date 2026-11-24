import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { StoryBadge } from "@/features/story/story-badges";

import { BadgeMedal } from "./badge-medal";
import { ink, lilita } from "./chapter-map-ink";

/** The campaign's badge shelf (STO-1129): Story Mode Champion on top, a slot per boss below. Fixed to the corner, over the scroll. */
export function BadgeShelf({ badges, bottom }: { badges: readonly StoryBadge[]; bottom: number }): ReactElement {
  const won = badges.filter((badge) => badge.won);
  const champion = badges.at(-1)!;
  return (
    <View
      accessibilityLabel={won.length === 0 ? "Badge shelf, empty" : `Badge shelf: ${won.map((badge) => badge.name).join(", ")}`}
      pointerEvents="none"
      style={[styles.shelf, { bottom }]}
      testID="story-badge-shelf"
    >
      <BadgeMedal badge={champion} size={38} />
      <View style={[styles.board, styles.topBoard]} />
      <View style={styles.row}>
        {badges.slice(0, -1).map((badge) => (
          <BadgeMedal key={badge.id} badge={badge} size={22} />
        ))}
      </View>
      <View style={styles.board} />
      <Text numberOfLines={1} style={styles.label}>{`BADGES ${won.length}/${badges.length}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { position: "absolute", right: 6, width: 140, zIndex: 10, alignItems: "center" },
  row: { flexDirection: "row", gap: 4, marginTop: 6 },
  board: {
    width: 136,
    height: 10,
    borderRadius: 3,
    backgroundColor: "#8f5530",
    boxShadow: "0px 4px 0px #3a1c0c, 0px 8px 12px rgba(0,0,0,0.45)",
  },
  topBoard: { width: 64 },
  label: {
    marginTop: 10,
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
