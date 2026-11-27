import { memo, useEffect, useState, type ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { Tile as WireTile } from "@wordpoker/contracts";

import { scaleTileMetrics } from "@/components/game/word-tile";
import { LIVELY_SPRING } from "@/components/ui/number-flow/const";
import { fonts, gradients, tileMaterial } from "@/constants/theme";

/** Letters the first reel rolls past before it lands; each reel to its right rolls further, so they stop in turn. */
const BASE_STEPS = 8;
const STEPS_PER_REEL = 2;
/** A wide grid adds fewer steps a reel, so the last of twelve still lands inside a second. */
const WIDE_STEPS_PER_REEL = 1;
const WIDE_REELS = 8;
/** One letter's pass at full speed. */
const STEP_MS = 42;
/** The smallest a letter shrinks to as it rolls out of the window (number-flow's falloff). */
const EDGE_SCALE = 0.55;

export interface SlotReelRollProps {
  reel: number;
  reels: number;
  /** The column before the spin: the letters the roll starts on. */
  from: readonly WireTile[];
  /** The column the spin dealt: the letters it lands on. */
  to: readonly WireTile[];
  /** The reel's strip and where its window now starts, for the letters rolling past. */
  strip: readonly WireTile[];
  top: number;
  scale: number;
  gap: number;
  onLanded: (reel: number) => void;
}

/**
 * A spinning reel, drawn over the real column until it lands: one strip of letters rolling down
 * through the window — the old letters out the bottom, the strip's own letters past, the dealt
 * ones in from the top — each shrinking and fading as it leaves the window, the way number-flow
 * rolls a digit, and settling on a lively spring.
 */
export const SlotReelRoll = memo(function SlotReelRoll({
  reel,
  reels,
  from,
  to,
  strip,
  top,
  scale,
  gap,
  onLanded,
}: SlotReelRollProps): ReactElement {
  const rows = to.length;
  const steps =
    BASE_STEPS +
    reel * (reels > WIDE_REELS ? WIDE_STEPS_PER_REEL : STEPS_PER_REEL);
  // Index 0..rows-1 the landing letters, then the strip upward from the window, then the old letters.
  const [letters] = useState(() => {
    const roll: string[] = to.map((tile) => tile.letter);
    for (let j = rows; j < steps; j += 1) {
      const at =
        (((top - (j - rows + 1)) % strip.length) + strip.length) % strip.length;
      roll.push(strip[at]?.letter ?? "");
    }
    for (const tile of from) roll.push(tile.letter);
    return roll;
  });

  const metrics = scaleTileMetrics("large", scale);
  const pitch = metrics.height + gap;
  const mv = useSharedValue(0);

  useEffect(() => {
    const cruise = (steps - 1) * STEP_MS;
    // Full speed down to one letter short, then the spring takes the last letter with the speed it
    // arrived at, overshooting a touch and settling.
    const speed = ((steps - 1) / cruise) * 1000;
    mv.value = withSequence(
      withTiming(steps - 1, {
        duration: cruise,
        easing: Easing.bezier(0.45, 0, 1, 1),
      }),
      withSpring(
        steps,
        { ...LIVELY_SPRING, velocity: Math.min(speed, 24) },
        (finished) => {
          if (finished) scheduleOnRN(onLanded, reel);
        },
      ),
    );
  }, [mv, steps, reel, onLanded]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.window,
        { width: metrics.width, height: rows * pitch - gap },
      ]}
    >
      {letters.map((letter, index) => (
        <RollGlyph
          // The roll's letters never change while it plays: index is their identity.
          key={index}
          index={index}
          letter={letter}
          mv={mv}
          steps={steps}
          rows={rows}
          pitch={pitch}
          metrics={metrics}
        />
      ))}
    </View>
  );
});

interface RollGlyphProps {
  index: number;
  letter: string;
  mv: SharedValue<number>;
  steps: number;
  rows: number;
  pitch: number;
  metrics: ReturnType<typeof scaleTileMetrics>;
}

/** One letter on the rolling strip: placed by the roll's progress, faded and shrunk outside the window. */
function RollGlyph({
  index,
  letter,
  mv,
  steps,
  rows,
  pitch,
  metrics,
}: RollGlyphProps): ReactElement {
  const animated = useAnimatedStyle(() => {
    const slot = index - steps + mv.value;
    const outside = slot < 0 ? -slot : slot > rows - 1 ? slot - (rows - 1) : 0;
    const presence = Math.max(0, 1 - outside);
    return {
      opacity: presence,
      transform: [
        { translateY: slot * pitch },
        { scale: EDGE_SCALE + (1 - EDGE_SCALE) * presence },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.glyph,
        {
          width: metrics.width,
          height: metrics.height,
          borderRadius: metrics.radius,
          borderBottomWidth: metrics.slab,
        },
        animated,
      ]}
    >
      <Text
        style={[
          styles.letter,
          {
            fontSize: metrics.letterSize,
            lineHeight: metrics.letterSize * 1.15,
          },
        ]}
      >
        {letter}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  window: { position: "absolute", top: 0, left: 0 },
  glyph: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: gradients.tile.colors[1],
    borderBottomColor: tileMaterial.slab,
  },
  letter: { fontFamily: fonts.arcade, color: tileMaterial.ink },
});
