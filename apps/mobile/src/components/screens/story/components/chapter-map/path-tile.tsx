import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PathTile as Tile } from "@/features/story/kitchen-table-map";

import { lilita } from "./chapter-map-ink";

/** One letter tile on the path; lit up to the next node, dimmed past it. */
export function PathTile({ tile }: { tile: Tile }): ReactElement {
  return (
    <View
      style={[
        styles.tile,
        {
          left: tile.x - 15,
          top: tile.y - 16,
          backgroundColor: tile.lit ? "#f6e6c4" : "#a59c8a",
          boxShadow: `0px 4px 0px ${tile.lit ? "#a87a3e" : "#4e483c"}, 0px 8px 10px rgba(0,0,0,0.35)`,
          transform: [{ rotate: `${tile.rotation}deg` }],
        },
      ]}
    >
      <Text style={[styles.letter, { color: tile.lit ? "#3a2210" : "#3e392f" }]}>{tile.letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: "absolute", width: 30, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  letter: { fontFamily: lilita, fontSize: 18, lineHeight: 20 },
});
