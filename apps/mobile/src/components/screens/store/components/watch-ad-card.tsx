/**
 * watch-ad-card.tsx — the Coin Store's rewarded ad row (`coin_store_rewarded`, STO-1063), drawn like
 * the DAILY BONUS row above it: what a view pays, how many are left today, and WATCH.
 */

import { AD_REWARD_COINS } from "@wordpoker/contracts";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";

import { GoldButton, STORE } from "./store-art";

export function adCaption(left: number, note: string | null): string {
  if (note) return note;
  if (left <= 0) return "Come back tomorrow";

  return `${left} left today`;
}

export function WatchAdCard({ left, busy, note, onWatch }: {
  left: number;
  busy: boolean;
  /** A one-off line after a view that paid nothing ("No ads available right now."). */
  note: string | null;
  onWatch: () => void;
}) {
  return (
    <LinearGradient colors={["#1f3a4a", "#12233a"]} style={styles.card} testID="store-watch-ad">
      <View style={styles.copy}>
        <Text style={styles.title}>{`WATCH AD → +${AD_REWARD_COINS} COINS`}</Text>
        <Text numberOfLines={1} style={styles.caption} testID="store-watch-ad-caption">{adCaption(left, note)}</Text>
      </View>
      <GoldButton
        accessibilityLabel={`Watch an ad for ${AD_REWARD_COINS} coins, ${left} left today`}
        disabled={busy || left <= 0}
        label={busy ? "···" : "WATCH"}
        onPress={onWatch}
        testID="store-watch-ad-button"
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderColor: STORE.gold,
    borderRadius: 16,
    borderWidth: 2,
    boxShadow: "0px 4px 0px #6b3416",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: STORE.tagEdge, fontFamily: fonts.arcade, fontSize: 17, letterSpacing: 0.7, lineHeight: 18 },
  caption: { color: "#cfe3d4", fontFamily: fonts.rubikMedium, fontSize: 12 },
});
