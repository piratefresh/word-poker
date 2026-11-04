import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FRIENDS, KITCHEN_TABLE, type CoachLine, type FriendId } from "@/features/story/kitchen-table-map";

import { ink, lilita } from "./chapter-map-ink";
import { FriendAvatar } from "./friend-avatar";

const BOSS_WATCHERS: readonly [number, number, FriendId][] = [[-96, 6, "ellis"], [96, 6, "jay"], [92, -70, "mira"]];

/** The friends around their nodes, and all three watching the boss; the one coaching sits in the bubble instead. */
export function MapFriends({ coach }: { coach: CoachLine }): ReactElement[] {
  const seats: { friend: FriendId; x: number; y: number }[] = [];
  for (const node of KITCHEN_TABLE.nodes) {
    if (node.kind === "boss") {
      for (const [dx, dy, friend] of BOSS_WATCHERS) {
        if (!(coach.node === node && coach.friend === friend)) seats.push({ friend, x: node.x + dx, y: node.y + dy });
      }
    } else if (node.friend && coach.node !== node) {
      seats.push({ friend: node.friend.id, x: node.x + node.friend.dx, y: node.y - 8 });
    }
  }
  return seats.map(({ friend, x, y }) => (
    <View key={`${friend}-${x}-${y}`} pointerEvents="none" style={[styles.friend, { left: x - 40, top: y - 33 }]}>
      <FriendAvatar friend={friend} size={40} />
      <Text style={styles.name}>{FRIENDS[friend].name}</Text>
    </View>
  ));
}

const styles = StyleSheet.create({
  friend: { position: "absolute", width: 80, alignItems: "center", gap: 3, zIndex: 2 },
  name: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.4, color: ink.cream, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: ink.scrim, overflow: "hidden" },
});
