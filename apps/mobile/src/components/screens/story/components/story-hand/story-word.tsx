import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import type { Tile as TileData } from "@wordpoker/contracts";

import { Tile } from "@/components/game";

/** A word as a row of tiles, in word order; what the reveal and the result put on the table. */
export function StoryWord({ tiles }: { tiles: readonly TileData[] }): ReactElement {
  return (
    <View style={styles.row}>
      {tiles.map((tile, index) => (
        <Tile key={`${tile.id}-${index}`} side="front" size="small" tile={tile} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: 4, justifyContent: "center" } });
