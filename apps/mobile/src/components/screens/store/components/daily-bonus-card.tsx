/**
 * daily-bonus-card.tsx — the felt DAILY BONUS row at the top of the store (STO-1045, design 1a).
 * It shows what `dailyBonus` decided: a lock caption, CLAIM, or a dimmed countdown once claimed.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";

import { formatCountdown, type DailyBonus } from "../daily-bonus";
import { Chest, GoldButton, STORE } from "./store-art";

/** "5 hours, 3 minutes" — the countdown as a screen reader says it. */
function countdownWords(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  return hours > 0 ? `${part(hours, "hour")}, ${part(rest, "minute")}` : part(rest, "minute");
}

function caption(bonus: DailyBonus): string {
  if (bonus.status === "locked") return bonus.caption;
  if (bonus.status === "claimed") return "Claimed. Come back tomorrow.";

  return `${formatCoins(bonus.reward)} coins, free every day`;
}

export function DailyBonusCard({ bonus, onClaim }: { bonus: DailyBonus; onClaim: () => void }) {
  return (
    <LinearGradient colors={["#1f4a33", "#12301f"]} style={styles.card} testID="store-daily-bonus">
      <Chest />
      <View style={styles.copy}>
        <Text style={styles.title}>DAILY BONUS</Text>
        <Text numberOfLines={1} style={styles.caption}>{caption(bonus)}</Text>
      </View>
      {bonus.status === "ready" ? (
        <GoldButton
          accessibilityLabel={`Claim daily bonus, ${formatCoins(bonus.reward)} coins`}
          label="CLAIM"
          onPress={onClaim}
          testID="store-daily-claim"
        />
      ) : bonus.status === "claimed" ? (
        <View
          accessibilityLabel={`Claimed. Next bonus in ${countdownWords(bonus.remainingMs)}`}
          accessible
          style={styles.waiting}
          testID="store-daily-claimed"
        >
          <Text style={styles.countdown}>{formatCountdown(bonus.remainingMs)}</Text>
        </View>
      ) : null}
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
  waiting: {
    alignItems: "center",
    backgroundColor: "rgba(8, 12, 28, 0.5)",
    borderColor: "rgba(243, 230, 196, 0.2)",
    borderRadius: 10,
    borderWidth: 2,
    height: 38,
    justifyContent: "center",
    minWidth: 84,
    paddingHorizontal: 12,
  },
  countdown: { color: "rgba(243, 230, 196, 0.6)", fontFamily: fonts.arcade, fontSize: 15, fontVariant: ["tabular-nums"], letterSpacing: 0.6 },
});
