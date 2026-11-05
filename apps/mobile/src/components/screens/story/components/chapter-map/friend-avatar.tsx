import type { ReactElement } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { AvatarArt } from "@/components/ui/avatar-art";
import { FRIENDS, type Expression, type FriendId } from "@/features/story/kitchen-table-map";

import { ink, lilita } from "./chapter-map-ink";

/** A friend as a circle: their portrait in the expression asked for, or their initial where there is no art. */
export function FriendAvatar({ friend, size, style, expression = "neutral" }: { friend: FriendId; size: number; style?: ViewStyle; expression?: Expression }): ReactElement {
  const faces = FRIENDS[friend].faces;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: FRIENDS[friend].color }, style]}>
      {faces === undefined ? (
        <Text style={[styles.initial, { fontSize: size * 0.48 }]}>{FRIENDS[friend].name[0]}</Text>
      ) : (
        <AvatarArt size={size - 6} source={faces[expression]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 3, borderColor: ink.parchment, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 0px rgba(0,0,0,0.35)" },
  initial: { fontFamily: lilita, color: "#ffffff" },
});
