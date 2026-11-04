import { Ionicons } from "@expo/vector-icons";
import type { ReactElement } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { ink } from "./chapter-map-ink";

export function Padlock({ style, size = 14 }: { style?: ViewStyle; size?: number }): ReactElement {
  return (
    <View style={[styles.padlock, style]}>
      <Ionicons name="lock-closed" size={size} color={ink.slateLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  padlock: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ink.slate,
    backgroundColor: "#1a1d2b",
    alignItems: "center",
    justifyContent: "center",
  },
});
