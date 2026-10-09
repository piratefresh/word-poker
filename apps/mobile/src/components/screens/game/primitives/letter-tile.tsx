import { StyleSheet, View } from "react-native";

import { Tile, type TileSize } from "@/components/game";
import { duration } from "@/constants/theme";

import type { LetterTileData } from "../game-types";

/** The `TileSize` a row's pixel width maps to, so a face-down tile sized off the same width matches. */
export function tileSizeFor(width: number): TileSize {
  return width >= 56 ? "large" : width >= 40 ? "medium" : "small";
}

export function LetterTile({
  tile,
  size,
  dimmed = false,
  dealDelayMs = 0,
  scale = 1,
}: {
  tile: LetterTileData;
  size: number;
  dimmed?: boolean;
  /** The beat this tile waits for before it deals, from the row it sits in. */
  dealDelayMs?: number;
  /** Grows the tile past its size's metrics, for a window larger than a phone. */
  scale?: number;
}) {
  return (
    <Tile
      animation="deal"
      dealDelayMs={dealDelayMs}
      dimmed={dimmed}
      ownership="neutral"
      scale={scale}
      side="front"
      size={tileSizeFor(size)}
      tile={tile}
    />
  );
}

export function EmptyTile({ size }: { size: number }) {
  return (
    <View style={[styles.emptyTile, { width: size, height: size * 1.18 }]} />
  );
}

/** The flop turns three tiles together; every street after it turns one. */
const FLOP_TILES = 3;

/**
 * The beat a community slot deals on: the slot's place in its own batch. The engine turns the
 * flop's three at once and one tile on each later street, so a slot's beat is its index inside
 * that batch and nothing else — and, read off the slot rather than remembered per render, it is
 * the same on every later render, so a later street deals its own tile and never an earlier one.
 *
 * The batch is derived from the deal's shape (`revealed` is 0, 3, 4 or 5) rather than from how
 * many slots happen to be filled: every slot a batch fills has all the slots before it filled
 * too, so a count of them would read 0 for all three of the flop's tiles.
 */
export function communityDealDelayMs(index: number): number {
  return (index < FLOP_TILES ? index : 0) * duration.tileStagger;
}

const styles = StyleSheet.create({
  emptyTile: {
    backgroundColor: "rgba(0,0,0,0.18)",
    borderColor: "rgba(212,175,55,0.22)",
    borderRadius: 6,
    borderStyle: "dashed",
    borderWidth: 1.5,
  },
});
