import { StyleSheet, View } from "react-native";

import { duration } from "@/constants/theme";

import type { LetterTileData } from "../game-types";
import { communityDealDelayMs, EmptyTile, LetterTile } from "./letter-tile";

export function PlayerRack({
  privateTiles,
  community,
}: {
  privateTiles: readonly LetterTileData[];
  community: readonly (LetterTileData | null)[];
}) {
  return (
    <View accessibilityLabel="Your letter rack" style={styles.rack}>
      {privateTiles.map((tile, index) => (
        <LetterTile
          dealDelayMs={index * duration.holeStagger}
          key={tile.id}
          size={36}
          tile={tile}
        />
      ))}
      {Array.from({ length: 5 }, (_, index) => community[index] ?? null).map(
        (tile, index) =>
          tile ? (
            <LetterTile
              dealDelayMs={communityDealDelayMs(index)}
              dimmed
              key={`rack-${index}`}
              size={36}
              tile={tile}
            />
          ) : (
            <EmptyTile key={`rack-empty-${index}`} size={36} />
          ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rack: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingBottom: 7,
    paddingTop: 4,
  },
});
