/**
 * vip-screen.tsx — the VIP back room (STO-1170, design: "VIP Loyalty Ideas" in the design canvas).
 *
 * Behind the green door: your tier, how far to the next, today's play-point cap, and two tabs —
 * every tier with what it pays, and how points are earned. A velvet curtain opens on arrival and
 * closes again before going back.
 */

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VIP_DAILY_PLAY_CAP, VIP_TIERS, vipProgress, vipTier } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { formatCoins } from "@/lib/ui/format";
import { tierColor, tierLabel } from "@/lib/vip/vip-look";

import { BackRoom } from "./back-room";
import { Curtain } from "./curtain";

const PERKS = ["", "", "Gold name tag", "1 free Swap a day", "Card back and felt", "Monthly VIP tournament", "Priority support"];

const EARN = [
  {
    title: "PLAY LONGER",
    color: "#7fd39a",
    sub: `The biggest earner. Counts toward ${VIP_DAILY_PLAY_CAP} a day.`,
    rows: [
      ["Finish a hand", "+10"],
      ["Every 10th hand at a table", "+50"],
      ["Leave a table after 10+ hands", "+40"],
      ["Login streak, day 2 to 7", "+40 to +140"],
    ],
  },
  {
    title: "BIGGER WORDS",
    color: "#f7d77a",
    sub: "Your word at showdown. No daily cap.",
    rows: [
      ["4 letters", "+2"],
      ["5 letters", "+5"],
      ["6 letters", "+10"],
      ["7 letters", "+20"],
      ["8 letters or more", "+40"],
      ["Use every tile", "+15"],
      ["Best word at the table", "+10"],
    ],
  },
  {
    title: "BET HARD",
    color: "#ff9f7a",
    sub: "Online tables, hands that reach showdown. Up to 50 a hand.",
    rows: [
      ["Every 10 coins you put in", "+1"],
      ["Win a pot all-in", "+20"],
    ],
  },
  {
    title: "BUY COINS",
    color: "#7fc4ff",
    sub: "Never multiplied by your tier.",
    rows: [
      ["100 coins", "+100"],
      ["1,000 coins", "+750"],
      ["10,000 coins", "+2,500"],
    ],
  },
] as const;

type Tab = "tiers" | "earn";

export function VipScreen() {
  const insets = useSafeAreaInsets();
  const { vip, refresh } = useQuests();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("tiers");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const leave = useCallback(() => setOpen(false), []);
  const onClosed = useCallback(() => router.back(), []);

  const points = vip?.points ?? 0;
  const progress = vipProgress(points);
  const tier = vipTier(progress.tier);
  const color = tierColor(progress.tier);
  const next = progress.next === null ? null : progress.next;
  const playToday = Math.min(vip?.playToday ?? 0, VIP_DAILY_PLAY_CAP);
  const capped = playToday >= VIP_DAILY_PLAY_CAP;

  return (
    <View style={styles.screen} testID="vip-screen">
      <BackRoom />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={leave} style={styles.back} testID="vip-back">
          <Text style={styles.backLabel}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>VIP CLUB</Text>

        <View style={[styles.card, { borderColor: color }]} testID="vip-tier-card">
          <View style={styles.cardTop}>
            <View style={[styles.diamond, { backgroundColor: color }]}>
              <Text style={styles.diamondNumber}>{progress.tier + 1}</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.kicker}>YOUR TIER</Text>
              <Text style={[styles.tierName, { color }]}>{tierLabel(progress.tier)}</Text>
              <Text style={styles.points}>{`${formatCoins(points)} VIP Points`}</Text>
            </View>
          </View>
          {next !== null ? (
            <View accessibilityLabel={`${formatCoins(progress.toNext)} points to ${tierLabel(next)}`} accessible style={styles.progressWrap}>
              <View style={styles.track}>
                <LinearGradient
                  colors={[color, tierColor(next)]}
                  end={{ x: 1, y: 0 }}
                  start={{ x: 0, y: 0 }}
                  style={[styles.fill, { width: `${Math.round(progress.fraction * 1000) / 10}%` }]}
                />
              </View>
              <View style={styles.progressText}>
                <Text style={styles.mute}>{`${formatCoins(progress.toNext)} points to go`}</Text>
                <Text style={[styles.mute, { color: tierColor(next) }]}>{tierLabel(next)}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.stats}>
            <Stat label="daily bonus" value={String(tier.dailyBonus)} />
            <Stat label="on coin packs" value={`+${tier.purchaseBonusPercent}%`} />
            <Stat label="points earned" value={`×${tier.multiplier}`} />
          </View>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {(["tiers", "earn"] as const).map((key) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              key={key}
              onPress={() => setTab(key)}
              style={styles.tab}
              testID={`vip-tab-${key}`}
            >
              {tab === key ? <LinearGradient colors={["#ffd877", "#e6a73e"]} style={StyleSheet.absoluteFill} /> : null}
              <Text style={[styles.tabLabel, tab === key && styles.tabLabelOn]}>{key === "tiers" ? "TIERS" : "HOW TO EARN"}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "earn" ? (
          <View style={styles.list}>
            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.panelTitle}>TODAY'S PLAY POINTS</Text>
                <Text style={[styles.capText, capped && styles.capFull]}>{`${playToday} / ${VIP_DAILY_PLAY_CAP}`}</Text>
              </View>
              <View style={styles.capTrack}>
                <View style={[styles.capFill, capped && styles.capFillFull, { width: `${(playToday / VIP_DAILY_PLAY_CAP) * 100}%` }]} />
              </View>
              <Text style={styles.mute}>
                {capped
                  ? "Cap reached. Hands still earn word and bet points. Resets at 00:00 UTC."
                  : `Points for playing hands stop at ${VIP_DAILY_PLAY_CAP} a day. Word and bet points have no cap. Resets at 00:00 UTC.`}
              </Text>
            </View>
            <Text style={[styles.multNote, { borderColor: color }]}>
              {`Your ${tier.name} multiplier ×${tier.multiplier} applies to play, word and bet points.`}
            </Text>
            {EARN.map((group) => (
              <View key={group.title} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={[styles.groupTitle, { color: group.color }]}>{group.title}</Text>
                  <Text style={styles.mute}>{group.sub}</Text>
                </View>
                {group.rows.map(([label, value]) => (
                  <View key={label} style={styles.earnRow}>
                    <Text style={styles.earnLabel}>{label}</Text>
                    <Text style={[styles.earnValue, { color: group.color }]}>{value}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {VIP_TIERS.map((row, index) => {
              const current = index === progress.tier;
              return (
                <View
                  key={row.name}
                  style={[styles.ladder, current && { borderColor: tierColor(index), borderWidth: 2 }, index > progress.tier + 1 && styles.dim]}
                  testID={`vip-tier-${index}`}
                >
                  <View style={[styles.smallDiamond, { backgroundColor: tierColor(index) }]} />
                  <View style={styles.ladderText}>
                    <View style={styles.ladderHead}>
                      <Text style={[styles.ladderName, { color: tierColor(index) }]}>{tierLabel(index)}</Text>
                      <Text style={styles.mute}>{`${formatCoins(row.threshold)} pts`}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.ladderRewards}>
                      {`${row.reward ? `+${formatCoins(row.reward)} coins · ` : ""}${row.dailyBonus} a day · +${row.purchaseBonusPercent}% on packs · ×${row.multiplier}`}
                    </Text>
                    {PERKS[index] ? <Text style={styles.perk}>{`★ ${PERKS[index]}`}</Text> : null}
                  </View>
                  <Text style={[styles.mark, { color: current ? tierColor(index) : "#7fd39a" }]}>
                    {current ? "YOU" : index < progress.tier ? "✓" : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <Text style={styles.footer}>Tiers are for life. Points never reset, and you never drop a tier.</Text>
      </ScrollView>
      <Curtain onClosed={onClosed} open={open} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const CARD_BG = "rgba(8, 12, 28, 0.82)";
const RIM = "rgba(243, 230, 196, 0.16)";

const styles = StyleSheet.create({
  screen: { backgroundColor: "#24100b", flex: 1 },
  content: { gap: 14, paddingHorizontal: 18 },
  back: {
    alignItems: "center",
    backgroundColor: "rgba(8, 12, 28, 0.7)",
    borderColor: "#e0974a",
    borderRadius: 999,
    borderWidth: 3,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  backLabel: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 22, lineHeight: 26 },
  title: { color: "#f3e6c4", fontFamily: fonts.arcade, fontSize: 34, letterSpacing: 1, textShadowColor: "#6b3416", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  card: { backgroundColor: "#152048", borderRadius: 18, borderWidth: 2, gap: 12, padding: 16 },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 14 },
  diamond: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 10,
    borderWidth: 3,
    height: 46,
    justifyContent: "center",
    margin: 8,
    transform: [{ rotate: "45deg" }],
    width: 46,
  },
  diamondNumber: { color: "#1a1206", fontFamily: fonts.arcade, fontSize: 22, transform: [{ rotate: "-45deg" }] },
  cardText: { flex: 1, gap: 4 },
  kicker: { color: "#aab3d6", fontFamily: fonts.rubikSemiBold, fontSize: 11, letterSpacing: 1.3 },
  tierName: { fontFamily: fonts.arcade, fontSize: 26, letterSpacing: 0.8 },
  points: { color: "#f3e6c4", fontFamily: fonts.rubikMedium, fontSize: 13 },
  progressWrap: { gap: 6 },
  track: { backgroundColor: "rgba(0, 0, 0, 0.45)", borderRadius: 7, height: 14, overflow: "hidden" },
  fill: { borderRadius: 7, height: "100%" },
  progressText: { flexDirection: "row", justifyContent: "space-between" },
  mute: { color: "#aab3d6", fontFamily: fonts.rubik, fontSize: 12, lineHeight: 17 },
  stats: { flexDirection: "row", gap: 6 },
  stat: { alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.3)", borderRadius: 10, flex: 1, paddingVertical: 8 },
  statValue: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 17 },
  statLabel: { color: "#aab3d6", fontFamily: fonts.rubikMedium, fontSize: 10.5 },
  tabs: {
    backgroundColor: "rgba(8, 12, 28, 0.92)",
    borderColor: "rgba(224, 151, 74, 0.6)",
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  tab: { alignItems: "center", borderRadius: 10, flex: 1, height: 38, justifyContent: "center", overflow: "hidden" },
  tabLabel: { color: "#f7d77a", fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.8 },
  tabLabelOn: { color: "#3a2210" },
  list: { gap: 10 },
  panel: { backgroundColor: CARD_BG, borderColor: RIM, borderRadius: 14, borderWidth: 1.5, gap: 7, padding: 14 },
  rowBetween: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  panelTitle: { color: "#f3e6c4", fontFamily: fonts.arcade, fontSize: 14, letterSpacing: 0.7 },
  capText: { color: "#7fd39a", fontFamily: fonts.rubikSemiBold, fontSize: 13 },
  capFull: { color: "#ffb38a" },
  capTrack: { backgroundColor: "rgba(0, 0, 0, 0.5)", borderRadius: 4, height: 8, overflow: "hidden" },
  capFill: { backgroundColor: "#5fb37e", height: "100%" },
  capFillFull: { backgroundColor: "#ff9f7a" },
  multNote: {
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1.5,
    color: "#f3e6c4",
    fontFamily: fonts.rubikMedium,
    fontSize: 12,
    padding: 10,
  },
  group: { backgroundColor: CARD_BG, borderColor: RIM, borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  groupHead: { borderBottomColor: "rgba(243, 230, 196, 0.1)", borderBottomWidth: 1, gap: 2, paddingHorizontal: 14, paddingVertical: 10 },
  groupTitle: { fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.8 },
  earnRow: { flexDirection: "row", gap: 10, justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 6 },
  earnLabel: { color: "#f3e6c4", flex: 1, fontFamily: fonts.rubikMedium, fontSize: 13 },
  earnValue: { fontFamily: fonts.arcade, fontSize: 15 },
  ladder: { alignItems: "center", backgroundColor: CARD_BG, borderColor: RIM, borderRadius: 14, borderWidth: 1.5, flexDirection: "row", gap: 12, padding: 12 },
  dim: { opacity: 0.6 },
  smallDiamond: { borderRadius: 5, height: 20, marginHorizontal: 4, transform: [{ rotate: "45deg" }], width: 20 },
  ladderText: { flex: 1, gap: 2 },
  ladderHead: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  ladderName: { fontFamily: fonts.arcade, fontSize: 15, letterSpacing: 0.6 },
  ladderRewards: { color: "#d9dcec", fontFamily: fonts.rubik, fontSize: 11.5 },
  perk: { color: "#f7d77a", fontFamily: fonts.rubikMedium, fontSize: 11 },
  mark: { fontFamily: fonts.arcade, fontSize: 12, letterSpacing: 0.6 },
  footer: { color: "#aab3d6", fontFamily: fonts.rubik, fontSize: 11.5, paddingHorizontal: 10, textAlign: "center" },
});
