import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { FRIENDS, MAP_WIDTH, discSize, type CoachLine } from "@/features/story/kitchen-table-map";

import { ink, lilita } from "./chapter-map-ink";
import { FriendAvatar } from "./friend-avatar";

/** The coaching friend's speech bubble, pinned above the node they're talking about. */
export function CoachBubble({ coach }: { coach: CoachLine }): ReactElement {
  const { node } = coach;
  const size = discSize(node);
  const left = Math.max(10, Math.min(MAP_WIDTH - 260, node.x - 125));
  const top = node.y - size / 2 - (node.kind === "boss" ? 56 : 18) - 92;
  const pointer = Math.max(20, Math.min(222, node.x - left - 9));
  return (
    <View accessibilityLiveRegion="polite" style={[styles.coach, { left, top }]} testID="story-coach">
      <FriendAvatar friend={coach.friend} size={46} style={styles.avatar} />
      <View style={styles.copy}>
        <Text style={styles.name}>{FRIENDS[coach.friend].name.toUpperCase()}</Text>
        <Text style={styles.line}>{coach.line}</Text>
      </View>
      <View style={[styles.pointer, { left: pointer }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  coach: {
    position: "absolute",
    width: 250,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: ink.plum,
    backgroundColor: ink.parchment,
    boxShadow: `0px 5px 0px ${ink.plum}, 0px 12px 20px rgba(0,0,0,0.4)`,
  },
  avatar: { boxShadow: `0px 0px 0px 2px ${ink.plum}` },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: lilita, fontSize: 12, letterSpacing: 0.7, color: ink.goldDeep },
  line: { fontFamily: fonts.rubikSemiBold, fontSize: 14, lineHeight: 18, color: ink.plum },
  pointer: {
    position: "absolute",
    bottom: -12,
    width: 18,
    height: 18,
    backgroundColor: ink.parchment,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: ink.plum,
    transform: [{ rotate: "45deg" }],
  },
});
