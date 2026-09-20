import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { PokerChipHero } from "@/components/ui/poker-chip-hero";
import { fonts } from "@/constants/theme";

export type SplashScreenProps = {
  onComplete?: () => void;
  autoAdvanceMs?: number;
};

/** The web kit's tokens (`styles.css`): the felt the splash sits on, with its gold and
 * cream. Kept here rather than bent onto `theme.ts` — the theme's own felt ramp is the
 * game's, and this screen is a faithful port of the web splash, not a restyle of it. */
const FELT_DEEP = "#072419";
const FELT_LIGHT = "#14523f";
const GOLD = "#d4a54a";
const CREAM = "#f6efe0";

/** Tailwind's `sm` breakpoint: below it the wordmark is `text-5xl` (48px) with a
 * `text-[10px]` tagline; at or above it `text-7xl` (72px) with `text-xs` (12px). */
const WORDMARK_BREAKPOINT = 640;
const WORDMARK_PX = { mobile: 48, wide: 72 } as const;
const TAGLINE_PX = { mobile: 10, wide: 12 } as const;

/** The web's gap-10 between the wordmark block and the chip, and mt-4 above the tagline. */
const CONTENT_GAP = 40;
const TAGLINE_MARGIN = 16;

export function SplashScreen({ onComplete, autoAdvanceMs = 2000 }: SplashScreenProps) {
  useEffect(() => {
    if (!onComplete) return;
    const timer = setTimeout(onComplete, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [onComplete, autoAdvanceMs]);

  const { width } = useWindowDimensions();
  const wide = width >= WORDMARK_BREAKPOINT;
  const wordSize = wide ? WORDMARK_PX.wide : WORDMARK_PX.mobile;
  const taglineSize = wide ? TAGLINE_PX.wide : TAGLINE_PX.mobile;

  return (
    <View testID="splash-screen" style={styles.root}>
      <SplashBackdrop />
      <View style={styles.content}>
        <View style={styles.wordmark}>
          {/* leading-[0.95] and tracking-tight (-0.025em) scale with the wordmark. */}
          <Text
            style={[
              styles.word,
              {
                fontSize: wordSize,
                lineHeight: Math.round(wordSize * 0.95),
                letterSpacing: wordSize * -0.025,
              },
            ]}
          >
            Word{"\n"}
            <Text style={styles.poker}>Poker</Text>
          </Text>
          <Text
            style={[
              styles.tagline,
              { fontSize: taglineSize, letterSpacing: taglineSize * 0.25 },
            ]}
          >
            Build words · Win pots
          </Text>
        </View>
        <PokerChipHero tone="gold" size="lg" spinning />
      </View>
    </View>
  );
}

/** The screen's whole background stack — the web's four CSS layers — as one full-bleed
 * SVG: React Native has no radial or repeating gradient, and this is the same ground the
 * felt (`table/poker-table.tsx`) is already drawn on. */
function SplashBackdrop() {
  // The glow is a circle, and a true circle's radius only exists in user space, so the
  // layer waits for one layout pass. Until then the felt and the hatch already cover the
  // screen — the glow is 8% alpha, its absence for a frame is not seen.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  return (
    // A plain View carries the onLayout: react-native-svg's Svg drops the prop on web
    // (an "unknown event handler" toast and, with it, the glow this measures for).
    <View
      testID="splash-backdrop"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) =>
          current?.width === width && current?.height === height ? current : { width, height },
        );
      }}
    >
      {/* Width and height as props, not just style: on web a Svg without them collapses
          to the SVG element's 300×150 default instead of filling its wrapper. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
        {/* `ellipse at center` with CSS's default farthest-corner sizing ends at all four
            corners — in a bounding-box gradient that corner distance is 70.7% (√2/2). */}
        <RadialGradient id="splash-felt" cx="50%" cy="50%" r="70.7%">
          <Stop offset="0%" stopColor={FELT_LIGHT} />
          <Stop offset="100%" stopColor={FELT_DEEP} />
        </RadialGradient>
        {/* The web's repeating-linear-gradient(45deg … 20px transparent, 1px line): a
            21px tile holding one 1px gold line, the tiling turned 45° the way the CSS
            axis runs. */}
        <Pattern
          id="splash-hatch"
          width={21}
          height={21}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <Rect x={20} width={1} height={21} fill={GOLD} fillOpacity={0.03} />
        </Pattern>
        {box ? (
          /* circle at 50% 40%, CSS's default farthest-side radius. */
          <RadialGradient
            id="splash-glow"
            gradientUnits="userSpaceOnUse"
            cx={box.width / 2}
            cy={box.height * 0.4}
            r={Math.max(box.width / 2, box.height * 0.6)}
          >
            <Stop offset="0%" stopColor={GOLD} stopOpacity={0.08} />
            <Stop offset="60%" stopColor={GOLD} stopOpacity={0} />
          </RadialGradient>
        ) : null}
      </Defs>
      <Rect width="100%" height="100%" fill="url(#splash-felt)" />
      <Rect width="100%" height="100%" fill="url(#splash-hatch)" />
      {box ? <Rect width="100%" height="100%" fill="url(#splash-glow)" /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The web's `h-dvh` and `bg-felt-deep`: fill the screen, and let the felt-deep show
   * for the frame before the SVG measures itself. */
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: FELT_DEEP,
  },
  content: {
    alignItems: "center",
    gap: CONTENT_GAP,
  },
  wordmark: {
    alignItems: "center",
  },
  /** The web's `font-display font-black` is Fraunces 900; the project's display face is
   * Noto Serif, which carries 700 as its heaviest cut — the closest registered weight. */
  word: {
    fontFamily: fonts.serifBold,
    color: CREAM,
    textAlign: "center",
  },
  poker: {
    fontFamily: fonts.serifBoldItalic,
    color: GOLD,
  },
  tagline: {
    fontFamily: fonts.mono,
    color: GOLD,
    textTransform: "uppercase",
    marginTop: TAGLINE_MARGIN,
    textAlign: "center",
  },
});
