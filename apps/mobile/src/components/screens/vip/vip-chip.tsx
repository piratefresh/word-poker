/**
 * vip-chip.tsx — the top bar's VIP pill (STO-1170): the tier's diamond and name in its color.
 * Opens the VIP back room.
 */

import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { tierColor, tierLabel } from "@/lib/vip/vip-look";

export function VipChip() {
  const { vip } = useQuests();
  if (!vip) return null;
  const color = tierColor(vip.tier);

  return (
    <Pressable
      accessibilityLabel={`VIP ${tierLabel(vip.tier)}, ${vip.points} points`}
      accessibilityRole="button"
      onPress={() => router.push("/vip")}
      style={[styles.pill, { borderColor: color }]}
      testID="home-vip"
    >
      <View style={[styles.diamond, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={styles.label}>{tierLabel(vip.tier)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(8, 12, 28, 0.7)",
    borderRadius: 999,
    borderWidth: 2.5,
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  diamond: {
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 3,
    borderWidth: 1.5,
    height: 12,
    transform: [{ rotate: "45deg" }],
    width: 12,
  },
  label: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 14, letterSpacing: 0.6 },
});
