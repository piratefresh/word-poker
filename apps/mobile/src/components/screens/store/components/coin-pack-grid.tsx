/**
 * coin-pack-grid.tsx — the COINS tab's two-column grid of RevenueCat packs (STO-1045, design 1a).
 * Each card is one press target that opens the confirm sheet; a tagged pack gets the navy card,
 * a gold rim and a red tag over its top edge.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, ledger } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";
import { useQuests } from "@/lib/quests/quests-provider";
import { packVipPoints, tierColor } from "@/lib/vip/vip-look";
import { vipPurchaseBonus, vipTier as vipTierAt } from "@wordpoker/game-rules";

const vipTierName = (tier: number) => vipTierAt(tier).name;

import type { CoinPackRow } from "../coin-packs";
import { CoinPile, STORE } from "./store-art";

/** "6,500 coins, 20% bonus, Most popular, $4.99". */
export function packLabel(row: CoinPackRow): string {
  return [
    `${formatCoins(row.coins)} coins`,
    row.bonusPercent > 0 ? `${row.bonusPercent}% bonus` : null,
    row.badge ?? null,
    row.priceString,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CoinPackGrid({
  rows,
  disabled,
  buying,
  onSelect,
}: {
  rows: readonly CoinPackRow[];
  disabled: boolean;
  buying: string | null;
  onSelect: (row: CoinPackRow) => void;
}) {
  const { vip } = useQuests();
  // Two to a row, always: an odd last pack keeps its column width beside an empty half.
  const pairs = Array.from({ length: Math.ceil(rows.length / 2) }, (_, i) => rows.slice(i * 2, i * 2 + 2));

  return (
    <View style={styles.grid}>
      {pairs.map((pair, rowIndex) => (
        <View key={pair[0].productId} style={styles.row}>
          {pair.map((row, column) => (
            <PackCard
              buying={buying === row.productId}
              disabled={disabled}
              index={rowIndex * 2 + column}
              key={row.productId}
              onPress={() => onSelect(row)}
              row={row}
              vipTier={vip?.tier ?? null}
            />
          ))}
          {pair.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

function PackCard({
  row,
  index,
  disabled,
  buying,
  onPress,
  vipTier,
}: {
  row: CoinPackRow;
  index: number;
  disabled: boolean;
  buying: boolean;
  onPress: () => void;
  /** The buyer's VIP tier, or `null` before it is read: VIP Points and tier bonus coins (STO-1170). */
  vipTier: number | null;
}) {
  const tagged = !!row.badge;
  const vipPoints = packVipPoints(row.productId);
  const tierBonus = vipTier === null ? 0 : vipPurchaseBonus(row.coins, vipTier);
  const face = (
    <>
      <View style={styles.art}>
        <CoinPile count={index + 1} dx={20} dy={12} size={30} top={16} />
      </View>
      <Text style={styles.amount}>{formatCoins(row.coins)}</Text>
      <Text style={styles.bonus}>{row.bonusPercent > 0 ? `+${row.bonusPercent}% bonus` : ""}</Text>
      {vipTier !== null && vipPoints > 0 ? (
        <View style={[styles.vip, { borderColor: tierColor(vipTier) }]} testID={`store-vip-${row.productId}`}>
          <View style={[styles.vipDiamond, { backgroundColor: tierColor(vipTier) }]} />
          <Text numberOfLines={1} style={styles.vipLabel}>{`+${formatCoins(vipPoints)} VIP`}</Text>
        </View>
      ) : null}
      {vipTier !== null && tierBonus > 0 ? (
        <Text numberOfLines={1} style={styles.bonus} testID={`store-tier-bonus-${row.productId}`}>
          {`+${formatCoins(tierBonus)} ${vipTierName(vipTier)} bonus`}
        </Text>
      ) : null}
      <LinearGradient colors={ledger.goldButton} style={styles.price} testID={`store-buy-${row.productId}`}>
        <Text style={styles.priceLabel}>{buying ? "BUYING…" : row.priceString}</Text>
      </LinearGradient>
    </>
  );

  return (
    <Pressable
      accessibilityLabel={packLabel(row)}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: buying }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed, disabled && styles.disabled]}
      testID={`store-pack-${row.productId}`}
    >
      {tagged ? (
        <LinearGradient colors={["#22336e", "#111a3c"]} style={[styles.card, styles.cardTagged]}>{face}</LinearGradient>
      ) : (
        <View style={styles.card}>{face}</View>
      )}
      {tagged ? (
        <View style={styles.tag}>
          <Text numberOfLines={1} style={styles.tagLabel}>{row.badge!.toUpperCase()}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12, paddingTop: 6 },
  row: { flexDirection: "row", gap: 12 },
  cell: { flex: 1 },
  card: {
    alignItems: "center",
    backgroundColor: STORE.card,
    borderColor: "rgba(243, 230, 196, 0.16)",
    borderRadius: 16,
    borderWidth: 2,
    boxShadow: "0px 4px 0px rgba(0, 0, 0, 0.45)",
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 14,
  },
  cardTagged: { backgroundColor: undefined, borderColor: STORE.tagEdge },
  pressed: { transform: [{ translateY: 2 }] },
  disabled: { opacity: 0.6 },
  art: { alignItems: "center", height: 46, justifyContent: "flex-start", width: 70 },
  amount: { color: STORE.ink, fontFamily: fonts.arcade, fontSize: 22, letterSpacing: 0.6, lineHeight: 24 },
  bonus: { color: STORE.bonus, fontFamily: fonts.rubikSemiBold, fontSize: 11, height: 14, lineHeight: 14 },
  price: {
    alignItems: "center",
    alignSelf: "stretch",
    borderColor: "#9a5f1c",
    borderRadius: 10,
    borderWidth: 2,
    boxShadow: "0px 3px 0px #8a4f14",
    height: 36,
    justifyContent: "center",
  },
  priceLabel: { color: STORE.darkInk, fontFamily: fonts.arcade, fontSize: 17, letterSpacing: 0.5 },
  vip: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  vipDiamond: { borderRadius: 2, height: 8, transform: [{ rotate: "45deg" }], width: 8 },
  vipLabel: { color: STORE.cream, fontFamily: fonts.rubikSemiBold, fontSize: 10.5 },
  tag: {
    alignSelf: "center",
    backgroundColor: STORE.tag,
    borderColor: STORE.tagEdge,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 9,
    paddingVertical: 2,
    position: "absolute",
    top: -11,
  },
  tagLabel: { color: "#fff6e2", fontFamily: fonts.arcade, fontSize: 11, letterSpacing: 0.55 },
});
