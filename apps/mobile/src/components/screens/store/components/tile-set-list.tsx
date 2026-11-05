/**
 * tile-set-list.tsx — the TILES tab: one row per tile set, previewing WORD in that set (STO-1045).
 *
 * The button says where the player stands with a set: IN USE (the row gets a gold rim), EQUIP for
 * one they own, or its price, which opens the confirm sheet.
 */

import { TILE_SET_IDS, TILE_SET_PRICES, type TileSetId } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { StyleSheet, Text, View } from "react-native";

import { Tile } from "@/components/game/word-tile";
import { fonts } from "@/constants/theme";
import { TileSetPaint } from "@/lib/tile-sets/tile-set-paint";
import { formatCoins } from "@/lib/ui/format";

import { Coin, FeltTag, GoldButton, OutlineButton, STORE } from "./store-art";

export const TILE_SET_COPY: Readonly<Record<TileSetId, { name: string; description: string }>> = {
  ivory: { name: "Ivory", description: "The house set" },
  jade: { name: "Jade", description: "Sage green, soft bevel" },
  rosewood: { name: "Rosewood", description: "Warm red grain" },
  midnight: { name: "Midnight", description: "Black tiles, gold letters" },
  "neon-alley": { name: "Neon Alley", description: "Bright letters on violet" },
};

/** A word's letters as `Tile`s worn in `set`. `tilt` scatters them a little, as if just dealt. */
export function TilePreview({ set, word, scale = 0.7, gap = 3, tilt = false }: { set: TileSetId; word: string; scale?: number; gap?: number; tilt?: boolean }) {
  return (
    <TileSetPaint.Provider value={set}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.preview, { gap }]}>
        {[...word].map((letter, index) => (
          <Tile
            animation="none"
            key={`${letter}-${index}`}
            scale={scale}
            shadow={tilt}
            side="front"
            size="small"
            style={tilt ? { transform: [{ rotate: `${(((index * 37) % 7) - 3) * 1.4}deg` }] } : undefined}
            tile={{ id: `${set}-${letter}-${index}`, letter, points: LETTER_VALUES[letter as Letter] }}
          />
        ))}
      </View>
    </TileSetPaint.Provider>
  );
}

export function TileSetList({
  owned,
  equipped,
  onEquip,
  onBuy,
}: {
  owned: readonly TileSetId[];
  equipped: TileSetId;
  onEquip: (set: TileSetId) => void;
  onBuy: (set: TileSetId) => void;
}) {
  return (
    <View style={styles.list}>
      {TILE_SET_IDS.map((set) => {
        const { name, description } = TILE_SET_COPY[set];
        const inUse = set === equipped;

        return (
          <View key={set} style={[styles.row, inUse && styles.rowInUse]} testID={`store-tile-set-${set}`}>
            <TilePreview set={set} word="WORD" />
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.name}>{name}</Text>
              <Text numberOfLines={1} style={styles.description}>{description}</Text>
            </View>
            {inUse ? (
              <View accessibilityLabel={`${name} tiles, in use`} accessible testID={`store-tile-in-use-${set}`}>
                <FeltTag label="IN USE" />
              </View>
            ) : owned.includes(set) ? (
              <OutlineButton
                accessibilityLabel={`Equip ${name} tiles`}
                label="EQUIP"
                onPress={() => onEquip(set)}
                size="sm"
                testID={`store-tile-equip-${set}`}
              />
            ) : (
              <GoldButton
                accessibilityLabel={`Buy ${name} tiles for ${formatCoins(TILE_SET_PRICES[set])} coins`}
                icon={<Coin edge={1.5} size={12} />}
                label={formatCoins(TILE_SET_PRICES[set])}
                onPress={() => onBuy(set)}
                size="sm"
                testID={`store-tile-buy-${set}`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    alignItems: "center",
    backgroundColor: STORE.card,
    borderColor: STORE.rim,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  rowInUse: { borderColor: STORE.gold },
  preview: { flexDirection: "row" },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  name: { color: STORE.cream, fontFamily: fonts.rubikMedium, fontSize: 15 },
  description: { color: STORE.mute, fontFamily: fonts.rubik, fontSize: 12 },
});
