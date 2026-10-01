import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { palette } from "@/constants/theme";

import { POWER_DRAW_MOTION } from "./power-draw-motion";

/**
 * What the impact is for: a card landing in the row, the kept card's stronger hit, or the pulse
 * that gathers at the row's centre before the first card lands.
 */
export type PowerImpactKind = "reveal" | "pick" | "gather";

const KINDS: Record<PowerImpactKind, { shell: number; stroke: number; spin: number; streaks: boolean }> = {
  reveal: { shell: 0.85, stroke: 1.5, spin: 160, streaks: true },
  pick: { shell: 1, stroke: 2.5, spin: 220, streaks: true },
  gather: { shell: 0.9, stroke: 1.5, spin: -200, streaks: false },
};

const STREAKS = 8;
const CLAMP = Extrapolation.CLAMP;

/**
 * One burst of energy behind a card, after a card-game "hit on the table": a gold-and-emerald
 * shell that blooms out from the card and cools, tapered crescents that slash round it, a dashed
 * ring turning inside a thin gold ring that expands and thins out, and eight short streaks flung
 * outward. A gather runs the shell and the rings inward instead, with no streaks. The white-hot
 * flash over the card's own face is the card's (`PowerOfferCard`), so the art stays crisp here.
 *
 * Plays once, `delay` after it mounts, and is gone `POWER_DRAW_MOTION.entrance.impact` later.
 * Unmounting it cancels whatever is left. It fills a `size` square centred on the point it is
 * placed at, takes no touches and says nothing to a screen reader: the cards are the draw.
 */
export function PowerImpact({
  size,
  delay,
  kind = "reveal",
}: {
  size: number;
  delay: number;
  kind?: PowerImpactKind;
}) {
  const t = useSharedValue(0);
  const { shell, stroke, spin, streaks } = KINDS[kind];
  const gather = kind === "gather";
  // SVG ids are global to a web document, and every card has an impact of its own.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    t.value = withDelay(
      delay,
      withTiming(1, { duration: POWER_DRAW_MOTION.entrance.impact, easing: Easing.out(Easing.quad) }),
    );
    return () => cancelAnimation(t);
  }, [delay, t]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: gather
      ? interpolate(t.value, [0, 0.55, 1], [0, shell, 0], CLAMP)
      : interpolate(t.value, [0, 0.08, 0.35, 0.75], [0, shell, shell * 0.7, 0], CLAMP),
    transform: [
      { scale: gather ? interpolate(t.value, [0, 1], [1, 0.35], CLAMP) : interpolate(t.value, [0, 0.4, 1], [0.4, 0.85, 0.95], CLAMP) },
    ],
  }));
  const crescentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.12, 0.6, 1], [0, 1, 0.75, 0], CLAMP),
    transform: [
      { rotate: `${-40 + t.value * spin}deg` },
      { scale: gather ? interpolate(t.value, [0, 1], [1, 0.5], CLAMP) : interpolate(t.value, [0, 1], [0.6, 1], CLAMP) },
    ],
  }));
  const dashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 0.8, 1], [0, 0.85, 0.5, 0], CLAMP),
    transform: [
      { rotate: `${-t.value * spin * 0.35}deg` },
      { scale: gather ? interpolate(t.value, [0, 1], [0.9, 0.4], CLAMP) : interpolate(t.value, [0, 1], [0.55, 0.75], CLAMP) },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.12, 1], [0, 1, 0], CLAMP),
    transform: [{ scale: gather ? interpolate(t.value, [0, 1], [1, 0.3], CLAMP) : interpolate(t.value, [0, 1], [0.5, 1], CLAMP) }],
  }));

  const half = size / 2;
  const crescentRadius = half * 0.86;
  const dashRadius = half * 0.9;
  const dash = (2 * Math.PI * dashRadius) / 36;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.impact, { height: size, left: -half, top: -half, width: size }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, shellStyle]}>
        <Svg height={size} width={size}>
          <Defs>
            {/* Hot at the core, an emerald rim, and gone at the edge: a sphere of light. */}
            <RadialGradient cx="50%" cy="50%" id={`shell-${id}`} r="50%">
              <Stop offset="0" stopColor={palette.gold050} stopOpacity={1} />
              <Stop offset="0.45" stopColor={palette.gold100} stopOpacity={0.75} />
              <Stop offset="0.78" stopColor={palette.green400} stopOpacity={0.55} />
              <Stop offset="0.9" stopColor={palette.green300} stopOpacity={0.35} />
              <Stop offset="1" stopColor={palette.green300} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={half} cy={half} fill={`url(#shell-${id})`} r={half} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, dashStyle]}>
        <Svg height={size} width={size}>
          <Circle
            cx={half}
            cy={half}
            fill="none"
            r={dashRadius}
            stroke={palette.green300}
            strokeDasharray={`${dash * 0.6} ${dash * 0.4}`}
            strokeWidth={Math.max(2, size * 0.018)}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, crescentStyle]}>
        <Svg height={size} width={size}>
          <Defs>
            <LinearGradient id={`crescent-${id}`} x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={palette.gold050} />
              <Stop offset="0.5" stopColor={palette.gold100} />
              <Stop offset="1" stopColor={palette.green300} />
            </LinearGradient>
          </Defs>
          {/* Two slashes, opposite each other, thick at the middle and sharp at both tips. */}
          <Path d={crescentPath(half, crescentRadius, -160, -40)} fill={`url(#crescent-${id})`} />
          <Path d={crescentPath(half, crescentRadius, 20, 140)} fill={`url(#crescent-${id})`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        <Svg height={size} width={size}>
          <Circle cx={half} cy={half} fill="none" r={half - stroke} stroke={palette.gold100} strokeWidth={stroke} />
        </Svg>
      </Animated.View>
      {streaks
        ? Array.from({ length: STREAKS }, (_, index) => (
            <Streak
              angle={(360 / STREAKS) * index + 360 / STREAKS / 2}
              color={index % 2 === 0 ? palette.gold050 : palette.green300}
              key={index}
              size={size}
              t={t}
            />
          ))
        : null}
    </View>
  );
}

/** One short streak, flung outward from the centre along `angle` and thinned as it goes. */
function Streak({ angle, color, size, t }: { angle: number; color: string; size: number; t: SharedValue<number> }) {
  const length = size * 0.09;
  const width = Math.max(2, size * 0.012);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1, 0.7, 1], [0, 1, 0.8, 0], CLAMP),
    transform: [
      { rotate: `${angle}deg` },
      { translateY: -interpolate(t.value, [0, 1], [size * 0.24, size * 0.47], CLAMP) },
      { scaleY: interpolate(t.value, [0, 0.3, 1], [0.4, 1.4, 0.3], CLAMP) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.streak,
        { backgroundColor: color, borderRadius: width, height: length, left: size / 2 - width / 2, top: size / 2 - length / 2, width },
        style,
      ]}
    />
  );
}

/**
 * A crescent round `centre` from `from` to `to` degrees (0 at three o'clock, clockwise): the
 * circle's own arc on the outside, and a flatter arc back between the same two points, so the
 * shape is thickest at its middle and tapers to a point at each end.
 */
function crescentPath(centre: number, radius: number, from: number, to: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${centre + radius * Math.cos(rad)} ${centre + radius * Math.sin(rad)}`;
  };
  const flat = radius * 1.4;
  return `M ${point(from)} A ${radius} ${radius} 0 0 1 ${point(to)} A ${flat} ${flat} 0 0 0 ${point(from)} Z`;
}

const styles = StyleSheet.create({
  impact: { position: "absolute" },
  streak: { position: "absolute" },
});
