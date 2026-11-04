import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { KITCHEN_TABLE } from "@/features/story/kitchen-table-map";

import { ink, lilita } from "./chapter-map-ink";

export interface ChapterMapHeaderProps {
  stars: number;
  topInset: number;
  onBack: () => void;
}

/** Back button, chapter title, and star total, fading into the map below. */
export function ChapterMapHeader({ stars, topInset, onBack }: ChapterMapHeaderProps): ReactElement {
  return (
    <LinearGradient
      colors={["rgba(6,8,22,0.94)", "rgba(6,8,22,0.78)", "rgba(6,8,22,0)"]}
      locations={[0, 0.7, 1]}
      pointerEvents="box-none"
      style={[styles.header, { paddingTop: topInset + 8 }]}
    >
      <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.back} testID="story-back">
        <Ionicons name="chevron-back" size={24} color={ink.cream} />
      </Pressable>
      <View accessibilityLabel={`Chapter ${KITCHEN_TABLE.number}, ${KITCHEN_TABLE.title}`} accessibilityRole="header" style={styles.titleBlock}>
        <Text style={styles.kicker}>{`CHAPTER ${KITCHEN_TABLE.number}`}</Text>
        <Text numberOfLines={1} style={styles.title}>
          {KITCHEN_TABLE.title}
        </Text>
      </View>
      <View accessibilityLabel={`${stars} of ${KITCHEN_TABLE.maxStars} stars`} style={styles.starTotal}>
        <Text style={styles.starIcon}>★</Text>
        <Text style={styles.starText}>{`${stars}/${KITCHEN_TABLE.maxStars}`}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 22,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: ink.amber,
    backgroundColor: "rgba(8,12,28,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.9, color: "#f7d77a" },
  title: { fontFamily: lilita, fontSize: 21, lineHeight: 23, letterSpacing: 0.4, color: ink.cream },
  starTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: ink.amber,
    backgroundColor: "rgba(8,12,28,0.8)",
  },
  starIcon: { fontFamily: fonts.rubik, fontSize: 18, color: ink.gold, textShadowColor: ink.goldDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  starText: { fontFamily: lilita, fontSize: 16, letterSpacing: 0.5, color: ink.cream },
});
