/**
 * tile-logo.tsx — the home screen's living logo (STO-568): nine letter tiles start scattered and
 * dimmed, then light up one at a time and spring into WORD over POKER. The finished tiles are
 * the logo; nothing replaces them.
 *
 * The box has a fixed height for two rows at the given width, so the cards below never move,
 * and every tile sits at its final place and moves by transforms alone. The intro plays once
 * per app session; with the OS's reduced motion on, the finished logo is drawn still.
 */

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";

import { TILE_METRICS, Tile } from "@/components/game/word-tile";
import { opacity, spacing } from "@/constants/theme";

/** The scattered tiles hold still this long before the first one lights. */
const SHUFFLE_MS = 1000;
/** Between one tile lighting and the next: nine tiles, done by about 4s. */
const STAGGER_MS = 300;
/** A lit tile's fade up from dimmed. */
const LIGHT_MS = 150;
const MOVE_SPRING = { damping: 13, stiffness: 160, mass: 0.9 } as const;
/** The pop a tile gives as it lands. */
const LAND_SCALE = 1.12;

const ROWS = ["WORD", "POKER"] as const;
/** The widest row sets the tiles' scale, so a narrow screen shrinks them rather than wrapping. */
const ROW_SLOTS = 5;
/** Tablets get bigger tiles, up to this factor of the large tile. */
const MAX_SCALE = 1.5;
const TILE = TILE_METRICS.large;
const GAP = 6;
const ROW_GAP = 10;
const PAD_Y = spacing.md;

/**
 * Where each tile waits before it lights, in reading order: x and y as fractions of the room the
 * box leaves a tile, and a tilt in degrees. Fixed, so the scatter never crowds out of the box.
 */
const SCATTER: readonly (readonly [number, number, number])[] = [
  [0.04, 0.32, -14],
  [0.3, 0.02, 9],
  [0.9, 0.5, 16],
  [0.8, 0.0, -10],
  [0.1, 0.9, 12],
  [0.36, 0.95, -8],
  [0.55, 0.42, 14],
  [0.63, 0.98, -12],
  [0.97, 0.94, 8],
];

/** Once per app session: coming back from a game shows the finished logo. */
let introPlayed = false;

interface Slot {
  key: string;
  letter: Letter;
  left: number;
  top: number;
  fromX: number;
  fromY: number;
  fromRotate: number;
  delay: number;
}

/** The tiles' scale and the box's height at a width. */
function tileLogoLayout(width: number) {
  const rowWidth = ROW_SLOTS * TILE.width + (ROW_SLOTS - 1) * GAP;
  const scale = Math.min(MAX_SCALE, width / rowWidth);
  const height = 2 * TILE.height * scale + ROW_GAP * scale + PAD_Y * 2;
  return { scale, height };
}

function slots(width: number): Slot[] {
  const { scale, height } = tileLogoLayout(width);
  const w = TILE.width * scale;
  const h = TILE.height * scale;
  const out: Slot[] = [];
  ROWS.forEach((word, row) => {
    const rowWidth = word.length * w + (word.length - 1) * GAP * scale;
    [...word].forEach((letter, col) => {
      const index = out.length;
      const left = (width - rowWidth) / 2 + col * (w + GAP * scale);
      const top = PAD_Y + row * (h + ROW_GAP * scale);
      const [fx, fy, rotate] = SCATTER[index];
      out.push({
        key: `${word}-${col}`,
        letter: letter as Letter,
        left,
        top,
        fromX: fx * (width - w) - left,
        fromY: fy * (height - h) - top,
        fromRotate: rotate,
        delay: SHUFFLE_MS + index * STAGGER_MS,
      });
    });
  });
  return out;
}

function LogoTile({ slot, scale, play }: { slot: Slot; scale: number; play: boolean }) {
  const progress = useSharedValue(play ? 0 : 1);
  const lit = useSharedValue(play ? opacity.muted : 1);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (!play) return;
    progress.set(withDelay(slot.delay, withSpring(1, MOVE_SPRING)));
    lit.set(withDelay(slot.delay, withTiming(1, { duration: LIGHT_MS })));
    pop.set(
      withDelay(
        slot.delay,
        withSequence(withTiming(LAND_SCALE, { duration: LIGHT_MS }), withSpring(1, MOVE_SPRING)),
      ),
    );
  }, [lit, play, pop, progress, slot.delay]);

  const motion = useAnimatedStyle(() => {
    const away = 1 - progress.get();
    return {
      opacity: lit.get(),
      transform: [
        { translateX: slot.fromX * away },
        { translateY: slot.fromY * away },
        { rotate: `${slot.fromRotate * away}deg` },
        { scale: pop.get() },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.tile, { left: slot.left, top: slot.top }, motion]}
      testID={`tile-logo-${slot.key}`}
    >
      <Tile
        animation="none"
        interactive={false}
        scale={scale}
        side="front"
        size="large"
        tile={{ id: slot.key, letter: slot.letter, points: LETTER_VALUES[slot.letter] }}
      />
    </Animated.View>
  );
}

export function TileLogo({ width }: { readonly width: number }): ReactElement {
  const reduceMotion = useReducedMotion();
  // Read once per mount: a re-render mid-intro must not snap the tiles home.
  const [play] = useState(() => !introPlayed && !reduceMotion);

  useEffect(() => {
    if (play) introPlayed = true;
  }, [play]);

  const { scale, height } = tileLogoLayout(width);

  return (
    <View
      accessibilityLabel="Word Poker"
      accessibilityRole="header"
      accessible
      // The scatter can overhang the box; it must never take a tap meant for the menu.
      pointerEvents="none"
      style={{ height, width }}
      testID="tile-logo"
    >
      <View aria-hidden style={StyleSheet.absoluteFill}>
        {slots(width).map((slot) => (
          <LogoTile key={slot.key} play={play} scale={scale} slot={slot} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: "absolute" },
});
