import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import type { LetterTileData } from "../game-types";
import { isCompactWindow, useScreenScale } from "../screen-scale";
import { Tile, TILE_METRICS } from "@/components/game";
import { webTestID } from "@/lib/ui/web-id";
import { LabelBand } from "./label-band";
import { communityDealDelayMs, EmptyTile, LetterTile, tileSizeFor } from "./letter-tile";

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

/**
 * Spotlight's beam (§44): a tile that gains its 2x while it sits on the felt drops in from above
 * with a gold glow, once. A tile that is dealt already doubled just appears — nothing was lit.
 */
function SpotlightBeam({
  tile,
  children,
  testID,
}: {
  tile: LetterTileData;
  children: ReactNode;
  testID: string;
}) {
  const reduceMotion = useReducedMotion();
  const previous = useRef({ id: tile.id, lit: tile.multiplier !== undefined });
  const drop = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    const lit = tile.multiplier !== undefined;
    const justLit = previous.current.id === tile.id && !previous.current.lit && lit;
    previous.current = { id: tile.id, lit };
    if (!justLit || reduceMotion) return;
    drop.value = 1;
    drop.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.back(1.6)) });
    glow.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 900 }));
    return () => {
      cancelAnimation(drop);
      cancelAnimation(glow);
    };
  }, [tile.id, tile.multiplier, reduceMotion, drop, glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -60 * drop.value }, { scale: 1 + 0.25 * drop.value }],
  }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Animated.View style={style} testID={testID}>
      <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
      {children}
    </Animated.View>
  );
}

export function CommunityStrip({
  tiles,
  inTable = false,
  scale: requestedScale,
  onPick,
}: {
  tiles: readonly (LetterTileData | null)[];
  /** On the tabletop the row sits in the table: no label band, undealt slots are tile backs. */
  inTable?: boolean;
  scale?: number;
  /** Spotlight's aim: a tap on a dealt tile with no bonus picks it; other tiles stay inert. */
  onPick?: (tile: LetterTileData) => void;
}) {
  const screenScale = useScreenScale();
  const scale = requestedScale ?? screenScale;
  const window = useWindowDimensions();
  // Match the word builder's medium tiles, or small tiles on a compact phone.
  const tileWidth = inTable
    ? TILE_METRICS[isCompactWindow(window) ? "small" : "medium"].width
    : COMMUNITY_TILE;
  const tileSize = tileWidth * scale;
  const rack = useMemo(() => rackStyles(tileSize), [tileSize]);
  const five = Array.from({ length: 5 }, (_, index) => tiles[index] ?? null);
  return (
    <View
      aria-label={inTable ? `Community ${five.filter(Boolean).length}/5` : undefined}
      role={inTable ? "group" : undefined}
      id={webTestID("community-strip")}
      style={inTable ? undefined : styles.community}
      testID="community-strip"
    >
      {inTable ? null : (
        <LabelBand>
          COMMUNITY {"·"} {five.filter(Boolean).length}/5
        </LabelBand>
      )}
      <View style={inTable ? undefined : rack.rack}>
        <View
          style={[
            styles.tileRow,
            !inTable && rack.opening,
            { gap: 6 * scale },
          ]}
        >
          {five.map((tile, index) => (
            tile ? (
              <SpotlightBeam
                key={`community-${index}`}
                testID={`community-slot-${index}`}
                tile={tile}
              >
                {onPick !== undefined && tile.multiplier === undefined ? (
                  <Pressable
                    accessibilityLabel={`Spotlight ${tile.letter}`}
                    accessibilityRole="button"
                    id={webTestID(`community-tile-${tile.id}`)}
                    onPress={() => onPick(tile)}
                    style={styles.target}
                    testID={`community-tile-${tile.id}`}
                  >
                    <LetterTile
                      dealDelayMs={communityDealDelayMs(index)}
                      scale={scale}
                      size={tileWidth}
                      tile={tile}
                    />
                  </Pressable>
                ) : (
                  <LetterTile
                    dealDelayMs={communityDealDelayMs(index)}
                    scale={scale}
                    size={tileWidth}
                    testID={`community-tile-${tile.id}`}
                    tile={tile}
                  />
                )}
              </SpotlightBeam>
            ) : inTable ? (
              <Tile
                key={`community-${index}`}
                ownership="neutral"
                scale={scale}
                side="back"
                size={tileSizeFor(tileWidth)}
                testID={`community-slot-${index}`}
                tile={BACK_TILE}
              />
            ) : (
              <EmptyTile
                key={`community-${index}`}
                size={tileSize}
                testID={`community-slot-${index}`}
              />
            )
          ))}
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
  // A tile the seat may aim Spotlight at wears a gold ring.
  target: { borderColor: "#e7c75a", borderRadius: 8, borderWidth: 2 },
  halo: {
    backgroundColor: "rgba(231,199,90,0.55)",
    borderRadius: 12,
    bottom: -8,
    left: -8,
    position: "absolute",
    right: -8,
    top: -8,
  },
});
