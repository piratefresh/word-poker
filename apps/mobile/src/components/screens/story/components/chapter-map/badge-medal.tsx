import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FRIENDS } from "@/features/story/chapter-map";
import type { StoryBadge } from "@/features/story/story-badges";

import { gradient, ink, lilita } from "./chapter-map-ink";

/** One badge at `size` (the medal's width): a gold medal on its ribbons once won, a dashed ring with the boss's letter until then. */
export function BadgeMedal({ badge, size }: { badge: StoryBadge; size: number }): ReactElement {
  const ribbon = { top: 0, width: size * 0.23, height: size * 0.42 };
  const disc = { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.07) };
  return (
    <View
      accessibilityLabel={badge.won ? badge.name : `${badge.name}, not won yet`}
      style={{ width: size, height: size * 1.25, justifyContent: "flex-end" }}
      testID={`story-badge-${badge.id}`}
    >
      {badge.won ? (
        <>
          <View style={[styles.ribbon, ribbon, { left: size * 0.2, backgroundColor: FRIENDS.jay.color, transform: [{ skewX: "12deg" }] }]} />
          <View style={[styles.ribbon, ribbon, { right: size * 0.2, backgroundColor: FRIENDS.ellis.color, transform: [{ skewX: "-12deg" }] }]} />
          <View style={[styles.medal, disc, gradient("radial-gradient(circle at 35% 30%, #ffe9a0, #e0a23a 65%, #b57a22)")]}>
            <Text style={[styles.letter, { fontSize: size * 0.5 }]}>{badge.letter}</Text>
          </View>
        </>
      ) : (
        <View style={[styles.empty, disc]}>
          <Text style={[styles.emptyLetter, { fontSize: size * 0.45 }]}>{badge.letter}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: { position: "absolute" },
  medal: { alignItems: "center", justifyContent: "center", borderColor: "#fff1c0", boxShadow: "0px 0px 10px rgba(255,210,110,0.7)" },
  letter: { fontFamily: lilita, color: "#7a4a10" },
  empty: { alignItems: "center", justifyContent: "center", borderStyle: "dashed", borderColor: "rgba(247,231,181,0.55)", backgroundColor: "rgba(8,12,28,0.55)" },
  emptyLetter: { fontFamily: lilita, color: ink.slateLight, opacity: 0.5 },
});
