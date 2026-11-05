import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";

import { ink } from "../chapter-map/chapter-map-ink";

/** The coach: one speech bubble under the opponent's seat, tucked under their seat. */
export function StorySpeech({ line }: { line: string }): ReactElement | null {
  if (line === "") return null;
  return (
    <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.bubble} testID="story-coach">
      <Text style={styles.line}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: ink.parchment,
    borderColor: ink.plum,
    borderRadius: 16,
    borderWidth: 3,
    boxShadow: `0px 5px 0px ${ink.plum}, 0px 12px 20px rgba(0,0,0,0.35)`,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  line: { color: ink.plum, fontFamily: fonts.rubikSemiBold, fontSize: 14, lineHeight: 18, textAlign: "center" },
});
