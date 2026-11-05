/**
 * tile-set-paint.ts — which tile set a `Tile` paints itself in (STO-1045).
 *
 * `TileSetsProvider` provides the player's equipped set at the app root; a store preview wraps its
 * tiles in a nearer provider to show a set before it is bought. Without any provider (a test, a
 * screen outside the app root) tiles wear the default set, the tile the table always drew.
 */

import { DEFAULT_TILE_SET, type TileSetId } from "@wordpoker/contracts";
import { createContext, useContext } from "react";

import { tileSetMaterial } from "@/constants/theme";

export const TileSetPaint = createContext<TileSetId>(DEFAULT_TILE_SET);

export type TileSetMaterial = (typeof tileSetMaterial)[TileSetId];

export function useTileSetMaterial(): TileSetMaterial {
  return tileSetMaterial[useContext(TileSetPaint)];
}
