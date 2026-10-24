import { StyleSheet, View } from "react-native";

import { duration } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

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
    <View
      accessibilityLabel="Your letter rack"
      id={webTestID("player-rack")}
      style={styles.rack}
      testID="player-rack"
    >
      {privateTiles.map((tile, index) => (
        <LetterTile
          dealDelayMs={index * duration.holeStagger}
          key={tile.id}
          size={36}
          testID={`player-rack-tile-${tile.id}`}
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
              testID={`player-rack-community-${tile.id}`}
              tile={tile}
            />
          ) : (
            <EmptyTile
              key={`rack-empty-${index}`}
              size={36}
              testID={`player-rack-community-slot-${index}`}
            />
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
