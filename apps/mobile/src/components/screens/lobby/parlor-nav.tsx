/** Night lobby masthead: back, player, live readout, and wallet. */

import { type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { formatCoins } from "@/lib/ui/format";
import { border, fonts, fontSize, layout, nightLobby, radius, spacing } from "@/constants/theme";

export interface ParlorNavProps {
  onBack: () => void;
  me?: string | null;
  readout: string;
  level?: number | null;
  coins?: number | null;
}

export function ParlorNav({ onBack, me, readout, level, coins }: ParlorNavProps): ReactElement {
  const name = me?.trim();
  const initial = name === undefined || name.length === 0 ? null : Array.from(name)[0]?.toUpperCase();

  return (
    <View style={styles.nav}>
      <View style={styles.left}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={layout.hitSlop}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          testID="parlor-back"
        >
          <Svg height={13} viewBox="0 0 9 13" width={9}>
            <Path d="M7 1L2 6.5L7 12" fill="none" stroke={nightLobby.gold.light} strokeLinecap="round" strokeWidth={1.8} />
          </Svg>
        </Pressable>
        <View accessible accessibilityLabel={initial === null ? "Signed out" : `Signed in as ${name}`} accessibilityRole="image" style={styles.avatar} testID="parlor-avatar">
          <Text style={styles.initial}>{initial ?? "·"}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>ONLINE</Text>
          <Text numberOfLines={1} style={styles.readout}>{readout}</Text>
        </View>
      </View>

      {level == null && coins == null ? null : (
        <View style={styles.stats}>
          {level == null ? null : (
            <View accessibilityLabel={`Level ${level}`} accessibilityRole="text" style={styles.level} testID="lobby-level">
              <Text style={styles.levelText}>LV {level}</Text>
            </View>
          )}
          {coins == null ? null : (
            <View accessibilityLabel={`${formatCoins(coins)} coins`} accessibilityRole="text" style={styles.wallet} testID="lobby-wallet">
              <View style={styles.coin} />
              <Text style={styles.walletText}>{formatCoins(coins)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.gutter,
  },
  left: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0 },
  back: {
    alignItems: "center",
    backgroundColor: "rgba(8,12,28,0.8)",
    borderColor: "#e0974a",
    borderRadius: radius.pill,
    borderWidth: border.thick,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  pressed: { opacity: 0.72 },
  avatar: {
    alignItems: "center",
    backgroundColor: "#d4a24c",
    borderColor: "#e0974a",
    borderRadius: radius.pill,
    borderWidth: border.thick,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  initial: { color: "#2a1906", fontFamily: fonts.arcade, fontSize: fontSize.bodyLg },
  titleBlock: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h3, letterSpacing: 0.8 },
  readout: { color: nightLobby.text.muted, fontFamily: fonts.rubikMedium, fontSize: fontSize.caption },
  stats: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  level: { backgroundColor: "rgba(8,12,28,0.72)", borderColor: "#e0974a", borderRadius: radius.pill, borderWidth: border.thick, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  levelText: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.body },
  wallet: {
    alignItems: "center",
    backgroundColor: "rgba(8,12,28,0.72)",
    borderColor: "#e0974a",
    borderRadius: radius.pill,
    borderWidth: border.thick,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  coin: { backgroundColor: "#ffe28a", borderColor: "#c98a2c", borderRadius: radius.pill, borderWidth: 2, height: 15, width: 15 },
  walletText: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.body },
});
