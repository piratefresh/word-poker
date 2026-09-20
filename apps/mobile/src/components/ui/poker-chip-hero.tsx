import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";

export type PokerChipHeroSize = "sm" | "md" | "lg" | "xl";
export type PokerChipHeroTone = "gold" | "red" | "blue" | "green" | "purple";

export type PokerChipHeroProps = {
  size?: PokerChipHeroSize;
  tone?: PokerChipHeroTone;
  spinning?: boolean;
};

/** The web kit's geometry: `h-7 w-7` … `h-24 w-24`, with its border widths. */
const SIZE_PX: Record<PokerChipHeroSize, number> = { sm: 28, md: 40, lg: 64, xl: 96 };
const BORDER_PX: Record<PokerChipHeroSize, number> = { sm: 2, md: 3, lg: 3, xl: 4 };

/** One entry per tone: the three gradient stops, then the two ring colours. Every value is
 * the web kit's (`PokerChipHero.tsx`), including the gold tone's felt-deep rings. */
const TONES: Record<
  PokerChipHeroTone,
  { stops: readonly [string, string, string]; border: string; inner: string }
> = {
  gold: {
    stops: ["#f5c76a", "#d4a54a", "#b8892e"],
    border: "rgba(7,36,25,0.8)",
    inner: "rgba(7,36,25,0.3)",
  },
  red: {
    stops: ["#c23d3d", "#8a2b2b", "#5c1a1a"],
    border: "rgba(212,165,74,0.6)",
    inner: "rgba(212,165,74,0.25)",
  },
  blue: {
    stops: ["#3b6cb5", "#2b4f8a", "#1a3460"],
    border: "rgba(212,165,74,0.55)",
    inner: "rgba(212,165,74,0.25)",
  },
  green: {
    stops: ["#4ac773", "#2c7a4f", "#1a5232"],
    border: "rgba(212,165,74,0.55)",
    inner: "rgba(212,165,74,0.25)",
  },
  purple: {
    stops: ["#9d56ff", "#6b3ab5", "#4c1d95"],
    border: "rgba(212,165,74,0.55)",
    inner: "rgba(212,165,74,0.25)",
  },
};

/** The web's `animate-spin` cadence, and its reduced-motion override. */
const SPIN_MS = 1000;
const SPIN_MS_REDUCED = 1500;

/** A dash reads as CSS `border-dashed` when it is about three border widths long with a
 * gap of the same size — the proportion the browsers' own dashed borders use. */
const DASH_WIDTHS = 3;

export function PokerChipHero({ size = "md", tone = "gold", spinning = false }: PokerChipHeroProps) {
  const reduceMotion = useReduceMotion();
  // SVG gradient ids are resolved across every mounted Svg on Android, so a chip that may
  // appear twice on one screen cannot share a fixed id.
  const id = `chip-${useId().replace(/[:«»]/g, "")}`;

  const box = SIZE_PX[size];
  const border = BORDER_PX[size];
  const { stops, border: borderColor, inner: innerColor } = TONES[tone];
  const stroke = border * DASH_WIDTHS;

  const rotation = useSharedValue(0);
  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: reduceMotion ? SPIN_MS_REDUCED : SPIN_MS,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [spinning, reduceMotion, rotation]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={[
        styles.shadow,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          // Android's elevation only casts a shadow from an opaque background; the disc
          // the SVG draws over it is the same colour, so it is never seen on its own.
          backgroundColor: stops[1],
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, spin]}>
        <Svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
          <Defs>
            {/* circle at 40% 35%, farthest-side: r is 60% of the (square) box. */}
            <RadialGradient id={id} cx="40%" cy="35%" r="60%">
              <Stop offset="0%" stopColor={stops[0]} />
              <Stop offset="50%" stopColor={stops[1]} />
              <Stop offset="100%" stopColor={stops[2]} />
            </RadialGradient>
          </Defs>
          {/* The disc reaches the very edge, so the dashed border's gaps show the
              gradient beneath them, the way a CSS border sits over its background. */}
          <Circle cx={box / 2} cy={box / 2} r={box / 2} fill={`url(#${id})`} />
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={box / 2 - border / 2}
            fill="none"
            stroke={borderColor}
            strokeWidth={border}
            strokeDasharray={`${stroke} ${stroke}`}
          />
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={box * 0.3}
            fill="none"
            stroke={innerColor}
            strokeWidth={border}
            strokeDasharray={`${stroke} ${stroke}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The web's drop shadow `0 4px 16px rgba(0,0,0,0.5)`; RN's iOS blur radius is half the
   * CSS blur, and elevation stands in on Android. The web's inset highlight has no RN
   * equivalent — the 40%/35% gradient highlight carries that depth instead. */
  shadow: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
});
