/**
 * tier-up-overlay.tsx — the full-screen tier-up moment (STO-1170): the new tier's diamond, the
 * coins its crossing paid, and what the tier now gives. Mounted once beside the app's routes.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { vipTier } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { formatCoins } from "@/lib/ui/format";
import { tierColor, tierLabel } from "@/lib/vip/vip-look";

const PERKS: Readonly<Record<number, string>> = {
  2: "Gold name tag",
  3: "1 free Swap a day",
  4: "Card back and felt",
  5: "Monthly VIP tournament",
  6: "Priority support",
};

export function TierUpOverlay() {
  const { tierUp, dismissTierUp } = useQuests();
  if (!tierUp) return null;
  const tier = vipTier(tierUp.tier);
  const color = tierColor(tierUp.tier);
  const rows = [
    `Daily bonus is now ${tier.dailyBonus} coins`,
    `+${tier.purchaseBonusPercent}% bonus coins on every pack`,
    `Points you earn ×${tier.multiplier}`,
    ...(PERKS[tierUp.tier] ? [`Unlocked: ${PERKS[tierUp.tier]}`] : []),
  ];

  return (
    <Modal animationType="fade" onRequestClose={dismissTierUp} transparent visible>
      <View accessibilityViewIsModal style={styles.scrim} testID="tier-up-overlay">
        <Text style={styles.kicker}>TIER UP</Text>
        <View style={[styles.diamond, { backgroundColor: color, boxShadow: `0px 0px 40px ${color}` }]}>
          <Text style={styles.number}>{tierUp.tier + 1}</Text>
        </View>
        <Text accessibilityRole="header" style={[styles.name, { color }]}>{tierLabel(tierUp.tier)}</Text>
        {tierUp.coins > 0 ? (
          <View style={styles.coins}>
            <Text style={styles.coinsLabel}>{`+${formatCoins(tierUp.coins)} COINS`}</Text>
          </View>
        ) : null}
        <View style={styles.rows}>
          {rows.map((row) => (
            <Text key={row} style={styles.row}>{row}</Text>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={dismissTierUp} style={styles.button} testID="tier-up-collect">
          <LinearGradient colors={["#ffd877", "#e6a73e"]} style={styles.buttonFace}>
            <Text style={styles.buttonLabel}>COLLECT</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: "center",
    backgroundColor: "rgba(10, 8, 24, 0.94)",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  kicker: { color: "#aab3d6", fontFamily: fonts.rubikSemiBold, fontSize: 12, letterSpacing: 2.4 },
  diamond: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 18,
    borderWidth: 5,
    height: 88,
    justifyContent: "center",
    margin: 16,
    transform: [{ rotate: "45deg" }],
    width: 88,
  },
  number: { color: "#1a1206", fontFamily: fonts.arcade, fontSize: 40, transform: [{ rotate: "-45deg" }] },
  name: { fontFamily: fonts.arcade, fontSize: 40, letterSpacing: 1.2 },
  coins: {
    backgroundColor: "#1f4a33",
    borderColor: "#e0974a",
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  coinsLabel: { color: "#f7d77a", fontFamily: fonts.arcade, fontSize: 20 },
  rows: {
    alignSelf: "stretch",
    backgroundColor: "rgba(8, 12, 28, 0.7)",
    borderColor: "rgba(243, 230, 196, 0.18)",
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 7,
    padding: 14,
  },
  row: { color: "#f3e6c4", fontFamily: fonts.rubikMedium, fontSize: 13 },
  button: { alignSelf: "stretch" },
  buttonFace: { alignItems: "center", borderRadius: 14, height: 54, justifyContent: "center" },
  buttonLabel: { color: "#3a2210", fontFamily: fonts.arcade, fontSize: 20, letterSpacing: 1 },
});
