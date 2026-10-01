import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import type { PowerUpId } from "@wordpoker/contracts";

import { palette } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

import { POWER_CARD_ASPECT, PowerCard, powerCardLabel } from "./power-card";
import { POWER_DRAW_MOTION, revealAtFor } from "./power-draw-motion";

const { entrance, exit: EXIT, focus: FOCUS, reduced: REDUCED } = POWER_DRAW_MOTION;
const CLAMP = Extrapolation.CLAMP;

/** `enter` runs 0 → 1 through the hit and 1 → 2 through the settle: 2 is a card at rest. */
const SETTLED = 2;

/** Where a card's draw left it: still on offer, the one the table kept, or one it let go. */
export type OfferFate = "offered" | "kept" | "dropped";

/**
 * One offer in the Power Draw's row. It lands face up with a hit — 0.55 → 1.14 → 1 — at its own
 * place in the stagger, rises and brightens while it is hovered, focused or pressed, and once the
 * table has settled the draw either lifts and flies down toward the action row (the kept card)
 * or fades and shrinks away. The burst of light behind it is the row's, not the card's
 * (`PowerImpact`), so every burst stays under every card.
 *
 * A fate that arrives during the entrance — the clock keeping a card before the row has landed —
 * stops the entrance where it is and plays the exit from the card at rest.
 */
export function PowerOfferCard({
  id,
  index,
  cardWidth,
  fate,
  lit,
  dimmed,
  disabled,
  flight,
  reduceMotion,
  onPress,
  onLight,
}: {
  id: PowerUpId;
  index: number;
  cardWidth: number;
  fate: OfferFate;
  /** Hovered, focused, pressed or kept: the card stands raised with its border bright. */
  lit: boolean;
  /** Another card is lit, so this one steps back. */
  dimmed: boolean;
  disabled: boolean;
  /** How far the kept card flies from its place to reach the lower centre of the region. */
  flight: { x: number; y: number };
  reduceMotion: boolean;
  onPress: () => void;
  /** The pointer, keyboard focus or a finger arrives on the card (`true`) or leaves it. */
  onLight: (lit: boolean) => void;
}) {
  const enter = useSharedValue(0);
  // 0 offered; the dropped card's fade runs to 1, the kept card's lift to 1 and its flight to 2.
  const leave = useSharedValue(0);
  const focus = useSharedValue(0);
  const pulse = useSharedValue(0);
  const dim = useSharedValue(1);
  // The kept card's white-hot hit, over its face, as the stronger impact blooms behind it.
  const hit = useSharedValue(0);
  const offered = fate === "offered";

  useEffect(() => {
    if (!offered) {
      cancelAnimation(enter);
      enter.value = SETTLED;
      return;
    }
    enter.value = reduceMotion
      ? withTiming(SETTLED, { duration: REDUCED.fadeIn })
      : withDelay(
          revealAtFor(index),
          withSequence(
            withTiming(1, { duration: entrance.hit, easing: Easing.out(Easing.quad) }),
            withTiming(SETTLED, { duration: entrance.settle, easing: Easing.out(Easing.cubic) }),
          ),
        );
    return () => cancelAnimation(enter);
  }, [enter, index, offered, reduceMotion]);

  useEffect(() => {
    if (fate === "offered") return;
    if (reduceMotion) {
      leave.value = withTiming(1, { duration: REDUCED.fadeOut });
    } else if (fate === "dropped") {
      leave.value = withDelay(EXIT.dropAt, withTiming(1, { duration: EXIT.drop, easing: Easing.in(Easing.quad) }));
    } else {
      leave.value = withSequence(
        withTiming(1, { duration: EXIT.lift, easing: Easing.out(Easing.back(2)) }),
        withDelay(EXIT.flightAt - EXIT.lift, withTiming(2, { duration: EXIT.flight, easing: Easing.in(Easing.cubic) })),
      );
      hit.value = withDelay(
        EXIT.impactAt,
        withSequence(withTiming(1, { duration: EXIT.hitIn }), withTiming(0, { duration: EXIT.hitOut })),
      );
    }
    return () => {
      cancelAnimation(leave);
      cancelAnimation(hit);
    };
  }, [fate, hit, leave, reduceMotion]);

  useEffect(() => {
    focus.value = withTiming(lit ? 1 : 0, { duration: FOCUS.duration });
    if (lit && !reduceMotion) {
      pulse.value = withSequence(
        withTiming(1, { duration: FOCUS.pulseIn }),
        withTiming(0, { duration: FOCUS.pulseOut }),
      );
    }
    return () => {
      cancelAnimation(focus);
      cancelAnimation(pulse);
    };
  }, [focus, lit, pulse, reduceMotion]);

  useEffect(() => {
    dim.value = withTiming(dimmed ? FOCUS.dim : 1, { duration: FOCUS.duration });
    return () => cancelAnimation(dim);
  }, [dim, dimmed]);

  const cardStyle = useAnimatedStyle(() => {
    const e = enter.value;
    const x = leave.value;
    const f = focus.value;

    // Reduced motion: no hit, no lift, no flight — the card fades in, and out with the draw.
    if (reduceMotion) return { opacity: (e / SETTLED) * (1 - x) * dim.value };

    const landing =
      e <= 1
        ? entrance.from + (entrance.peak - entrance.from) * e
        : entrance.peak - (entrance.peak - 1) * (e - 1);
    const shown = Math.min(e * 3, 1);
    const raised = 1 + (FOCUS.scale - 1) * f;

    if (fate === "kept") {
      return {
        opacity: shown * interpolate(x, [0, 1.6, 2], [1, 1, 0], CLAMP),
        zIndex: 1,
        transform: [
          { translateX: interpolate(x, [1, 2], [0, flight.x], CLAMP) },
          { translateY: interpolate(x, [0, 1, 2], [-FOCUS.lift * f, -cardWidth * 0.06, flight.y], CLAMP) },
          { scale: landing * interpolate(x, [0, 1, 2], [raised, EXIT.liftScale, EXIT.flightScale], CLAMP) },
        ],
      };
    }

    return {
      opacity: shown * dim.value * (1 - x),
      transform: [
        { translateY: -FOCUS.lift * f },
        { scale: landing * raised * (1 - (1 - EXIT.dropScale) * x) },
      ],
    };
  });

  // The card lands white-hot and cools to its art through the settle.
  const flashStyle = useAnimatedStyle(() => ({
    opacity: Math.max(
      offered ? interpolate(enter.value, [0, 1, 1.45], [0.95, 0.6, 0], CLAMP) : 0,
      hit.value * 0.85,
    ),
  }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: 0.15 + 0.85 * focus.value }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));

  const corner = cardWidth * 0.08;

  return (
    <Animated.View style={[{ height: cardWidth * POWER_CARD_ASPECT, width: cardWidth }, cardStyle]}>
      <View pointerEvents="none" style={[styles.glow, { borderRadius: corner + 3 }]} />
      <Pressable
        accessibilityLabel={powerCardLabel(id)}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: fate === "kept" }}
        disabled={disabled}
        id={webTestID(`power-offer-${id}`)}
        onBlur={() => onLight(false)}
        onFocus={() => {
          if (!disabled) onLight(true);
        }}
        onHoverIn={() => {
          if (!disabled) onLight(true);
        }}
        onHoverOut={() => onLight(false)}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) onLight(true);
        }}
        // A press that lands is held lit by the pick itself; one that slides off lets go.
        onPressOut={() => onLight(false)}
        testID={`power-offer-${id}`}
      >
        <PowerCard id={id} width={cardWidth} />
        {reduceMotion ? null : (
          <Animated.View pointerEvents="none" style={[styles.flash, { borderRadius: corner }, flashStyle]} />
        )}
        <Animated.View pointerEvents="none" style={[styles.border, { borderRadius: corner }, borderStyle]} />
        {reduceMotion ? null : (
          <Animated.View pointerEvents="none" style={[styles.pulse, { borderRadius: corner + 4 }, pulseStyle]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A faint, static halo round the frame: the settled row reads as lit without moving.
  glow: {
    backgroundColor: "rgba(247,223,122,0.1)",
    bottom: -3,
    left: -3,
    position: "absolute",
    right: -3,
    shadowColor: palette.gold200,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    top: -3,
  },
  border: {
    borderColor: palette.gold050,
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: palette.gold100,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    top: 0,
  },
  flash: {
    backgroundColor: "#fffbea",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: palette.gold100,
    shadowOpacity: 1,
    shadowRadius: 18,
    top: 0,
  },
  pulse: {
    borderColor: palette.gold050,
    borderWidth: 2,
    bottom: -4,
    left: -4,
    position: "absolute",
    right: -4,
    top: -4,
  },
});
