import type { ReactElement } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { FRIENDS, type FriendId } from "@/features/story/kitchen-table-map";

import { ink, lilita } from "./chapter-map-ink";

export function FriendAvatar({ friend, size, style }: { friend: FriendId; size: number; style?: ViewStyle }): ReactElement {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: FRIENDS[friend].color }, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.48 }]}>{FRIENDS[friend].name[0]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 3, borderColor: ink.parchment, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 0px rgba(0,0,0,0.35)" },
  initial: { fontFamily: lilita, color: "#ffffff" },
});
