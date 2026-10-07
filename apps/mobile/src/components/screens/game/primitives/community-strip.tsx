import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { LetterTileData } from "../game-types";
import { useScreenScale } from "../screen-scale";
import { Tile } from "@/components/game";
import { LabelBand } from "./label-band";
import { communityDealDelayMs, EmptyTile, LetterTile } from "./letter-tile";

/** The rack picture, in its own pixels. */
const RACK_IMAGE = { width: 2172, height: 724 };
/** The painted frame's top and bottom (the rest of the picture is transparent margin). */
const RACK_PAINTED = { top: 114, bottom: 567 };
/** The frame's inner opening, where the tiles sit, in the picture's pixels. */
const RACK_OPENING = { x: 196, y: 191, width: 1788, height: 310 };
/** The community tile on a phone; a larger window grows it by the screen scale. */
const COMMUNITY_TILE = 42;

/** The rack, sized to hold one tile: the art is scaled so its opening fits the tile. */
function rackStyles(tile: number) {
  // The opening holds a tile with a few points of wood-shadow clearance above and below.
  const scale = (tile + 10) / RACK_OPENING.height;
  return StyleSheet.create({
    // The rack is cropped to its painted frame, so its transparent margin takes no room.
    rack: {
      height: (RACK_PAINTED.bottom - RACK_PAINTED.top) * scale,
      width: RACK_IMAGE.width * scale,
    },
    art: {
      height: RACK_IMAGE.height * scale,
      left: 0,
      position: "absolute",
      top: -RACK_PAINTED.top * scale,
      width: RACK_IMAGE.width * scale,
    },
    opening: {
      alignItems: "center",
      height: RACK_OPENING.height * scale,
      justifyContent: "center",
      left: RACK_OPENING.x * scale,
      position: "absolute",
      top: (RACK_OPENING.y - RACK_PAINTED.top) * scale,
      width: RACK_OPENING.width * scale,
    },
  });
}

/** What an undealt slot's face-down tile is drawn from; its letter is never shown. */
const BACK_TILE: LetterTileData = { id: "undealt", letter: "A", points: 1 };

export function CommunityStrip({
  tiles,
  inTable = false,
  scale: requestedScale,
}: {
  tiles: readonly (LetterTileData | null)[];
  /** On the tabletop the row sits in the table: no label band, undealt slots are tile backs. */
  inTable?: boolean;
  scale?: number;
}) {
  const screenScale = useScreenScale();
  const scale = requestedScale ?? screenScale;
  const tileWidth = inTable ? 58 : COMMUNITY_TILE;
  const tileSize = tileWidth * scale;
  const rack = useMemo(() => rackStyles(tileSize), [tileSize]);
  const five = Array.from({ length: 5 }, (_, index) => tiles[index] ?? null);
  return (
    <View style={inTable ? undefined : styles.community}>
      {inTable ? null : (
        <LabelBand>
          COMMUNITY {"·"} {five.filter(Boolean).length}/5
        </LabelBand>
      )}
      <View style={inTable ? undefined : rack.rack}>
        <View style={[styles.tileRow, !inTable && rack.opening, { gap: 6 * scale }]}>
          {five.map((tile, index) =>
            tile ? (
              <LetterTile
                dealDelayMs={communityDealDelayMs(index)}
                key={`community-${index}`}
                scale={scale}
                size={tileWidth}
                tile={tile}
              />
            ) : inTable ? (
              <Tile
                key={`community-${index}`}
                ownership="neutral"
                scale={scale}
                side="back"
                size="large"
                tile={BACK_TILE}
              />
            ) : (
              <EmptyTile key={`community-${index}`} size={tileSize} />
            ),
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  community: {
    alignItems: "center",
    paddingTop: 10,
  },
  tileRow: { flexDirection: "row", gap: 6 },
});
