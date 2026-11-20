import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { backgroundImage } from "@/components/chip/coin-chip";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { GameButton } from "@/components/ui/game-button";
import { fonts, layout, palette, spacing } from "@/constants/theme";

/** One line of the wait: shown from `atMs` after the overlay mounts until the next step's. */
export interface LoaderStep {
  atMs: number;
  message: string;
  detail?: string;
}

export interface LoaderOverlayProps {
  /** The wait, in order. A single step is a plain message; more step through on their own. */
  steps: readonly LoaderStep[];
  /** Offered once the wait runs long (`slowAfterMs`); never before, so a short wait looks fine. */
  onLeave?: () => void;
  leaveLabel?: string;
  slowAfterMs?: number;
  /** The tip card. Off for waits too short to read one. */
  tips?: boolean;
  /** Chrome drawn over the felt (a back pill), laid out by the caller. */
  children?: ReactNode;
  testID?: string;
}

/** Design 1a's tips, cut to a line or two each. */
export const LOADER_TIPS = [
  "While your opponent is thinking, plan your best word.",
  "Bluffing works: a big bet with a weak word can make them fold before anyone shows a tile.",
  "High-value letters and 2× / 3× tiles on the board win more than long words.",
  "In a Wild game a blank tile can be any letter. Save it for the river.",
  "Tap How to play at the table any time for the rules.",
] as const;

const SLOW_AFTER_MS = 9000;

/**
 * The wait, on the felt (design 1a): a gold W chip spinning on its edge above its shadow, the
 * step it is on, a tip with Next tip, and — only once the wait runs long — the way out.
 * The message is a polite live region, so a screen reader hears each step once.
 */
export function LoaderOverlay({
  steps,
  onLeave,
  leaveLabel = "Back to lobby",
  slowAfterMs = SLOW_AFTER_MS,
  tips = true,
  children,
  testID = "loader-overlay",
}: LoaderOverlayProps) {
  const insets = useSafeAreaInsets();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tip, setTip] = useState(0);

  // One timer per mark (each step, and the slow one) rather than a running clock.
  const marks = [slowAfterMs, ...steps.map((each) => each.atMs)].filter((ms) => ms > 0).join(",");
  useEffect(() => {
    const timers = marks.split(",").map((ms) => setTimeout(() => setElapsedMs((at) => Math.max(at, Number(ms))), Number(ms)));
    return () => timers.forEach(clearTimeout);
  }, [marks]);

  const step = steps.filter((each) => elapsedMs >= each.atMs).pop() ?? steps[0];
  const slow = onLeave !== undefined && elapsedMs >= slowAfterMs;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl }]}
      testID={testID}
    >
      {children}
      <View style={styles.body}>
        <SpinningCoin />

        <View accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.status}>
          <Text style={styles.message} testID={`${testID}-message`}>
            {step?.message}
            <Dots />
          </Text>
          {step?.detail ? (
            <Text style={styles.detail} testID={`${testID}-detail`}>
              {step.detail}
            </Text>
          ) : null}
        </View>

        {tips ? (
          <View style={styles.tipCard}>
            <View style={styles.tipHead}>
              <Text style={styles.tipKicker}>TIP</Text>
              <View style={styles.tipRule} />
              <Text style={styles.tipCount}>
                {(tip % LOADER_TIPS.length) + 1} / {LOADER_TIPS.length}
              </Text>
            </View>
            <Animated.Text entering={FadeInDown.duration(350)} key={tip} style={styles.tipText}>
              {LOADER_TIPS[tip % LOADER_TIPS.length]}
            </Animated.Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={() => setTip((n) => n + 1)}
              style={({ pressed }) => [styles.nextTip, pressed && styles.pressed]}
              testID={`${testID}-next-tip`}
            >
              <Text style={styles.nextTipText}>Next tip ›</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {slow ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.slow}>
          <Text style={styles.detail} testID={`${testID}-slow`}>
            This is taking longer than usual.
          </Text>
          <GameButton label={leaveLabel} onPress={onLeave} testID={`${testID}-leave`} variant="dark" />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The message's trailing dots, counting up; a still ellipsis under reduced motion. */
function Dots() {
  const reduceMotion = useReduceMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setCount((n) => (n + 1) % 4), 350);
    return () => clearInterval(timer);
  }, [reduceMotion]);
  // Padded to three so the line never shifts as the dots count.
  return <Text>{reduceMotion ? "…" : ".".repeat(count).padEnd(3, " ")}</Text>;
}

/* ── the coin ─────────────────────────────────────────────────────── */

const COIN = 148;
/** The chip's thickness, as the design's 9px either side of the middle. */
const THICK = 18;
/** Edge slices stacked through the thickness; enough that the band never shows a gap. */
const SLICES = 10;
const SLICE_GAP = THICK / (SLICES - 1);
/** Edge-on, a slice is still this wide, so neighbours overlap into one solid band. */
const MIN_SCALE = (SLICE_GAP + 1.5) / COIN;
const SPIN_MS = 2200;
const SPIN_MS_REDUCED = 6000;
const BOB_MS = 1200;
const SPIN_EASING = Easing.bezier(0.45, 0.05, 0.55, 0.95);

/**
 * A thick gold W chip turning on its vertical axis. React Native has no `preserve-3d`, so the
 * depth is built by hand: the rim is a stack of discs spread through the chip's thickness, each
 * sliding sideways with sin θ and squeezed by |cos θ|; the face rides on whichever side of the
 * stack is towards the viewer. Decorative; the status line speaks for it.
 */
export function SpinningCoin() {
  const reduceMotion = useReduceMotion();
  const turn = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    turn.value = 0;
    turn.value = withRepeat(
      withTiming(1, { duration: reduceMotion ? SPIN_MS_REDUCED : SPIN_MS, easing: SPIN_EASING }),
      -1,
      false,
    );
    bob.value = reduceMotion
      ? 0
      : withRepeat(
          withSequence(
            withTiming(-8, { duration: BOB_MS, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: BOB_MS, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        );
    return () => {
      cancelAnimation(turn);
      cancelAnimation(bob);
    };
  }, [bob, reduceMotion, turn]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const faceStyle = useAnimatedStyle(() => {
    const angle = turn.value * 2 * Math.PI;
    const cos = Math.cos(angle);
    const facing = cos >= 0 ? 1 : -1;
    return {
      transform: [
        { translateX: (THICK / 2) * Math.sin(angle) * facing },
        { scaleX: Math.max(Math.abs(cos), 0.001) },
      ],
    };
  });
  // The face darkens as it turns away from the light.
  const faceShade = useAnimatedStyle(() => ({
    opacity: (1 - Math.abs(Math.cos(turn.value * 2 * Math.PI))) * 0.45,
  }));
  const shadowStyle = useAnimatedStyle(() => {
    const cos = Math.abs(Math.cos(turn.value * 2 * Math.PI));
    return { opacity: 0.3 + 0.25 * cos, transform: [{ scaleX: 0.35 + 0.65 * cos }] };
  });

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.coinStage}>
      <Animated.View style={bobStyle}>
        {/* Tilted toward the viewer; the spin inside stays flat in this plane. */}
        <View style={styles.tilt}>
          {Array.from({ length: SLICES }, (_, index) => (
            <EdgeSlice index={index} key={index} turn={turn} />
          ))}
          <Animated.View style={[styles.coinLayer, faceStyle]}>
            <CoinFace />
            <Animated.View style={[styles.coinLayer, styles.faceShade, faceShade]} />
          </Animated.View>
        </View>
      </Animated.View>
      <Animated.View style={[styles.coinShadow, backgroundImage(SHADOW_IMAGE), shadowStyle]} />
    </View>
  );
}

function EdgeSlice({ index, turn }: { index: number; turn: SharedValue<number> }) {
  const depth = -THICK / 2 + index * SLICE_GAP;
  const style = useAnimatedStyle(() => {
    const angle = turn.value * 2 * Math.PI;
    return {
      transform: [
        { translateX: depth * Math.sin(angle) },
        { scaleX: Math.max(Math.abs(Math.cos(angle)), MIN_SCALE) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.coinLayer, styles.edge, style]}>
      {RIM_BANDS.map((band) => (
        <View key={band.top} style={[styles.rimBand, { top: band.top, height: band.height }]} />
      ))}
      <View style={[StyleSheet.absoluteFill, backgroundImage(RIM_SHADE)]} />
    </Animated.View>
  );
}

/**
 * The rim's cream inserts as seen side-on: the design's 8 cream runs of 18° around the edge,
 * each laid on the vertical where the near half of the rim passes it.
 */
const RIM_BANDS = Array.from({ length: 8 }, (_, index) => {
  const from = ((11 + index * 45) * Math.PI) / 180;
  const to = from + (18 * Math.PI) / 180;
  const y1 = (COIN / 2) * (1 - Math.cos(from));
  const y2 = (COIN / 2) * (1 - Math.cos(to));
  return { top: Math.min(y1, y2), height: Math.max(Math.abs(y2 - y1), 1) };
}).filter((band) => band.top < COIN);

const RIM_SHADE = "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.3))";
const FACE_GOLD = `radial-gradient(circle at 35% 30%, ${palette.gold100}, ${palette.gold300} 55%, ${palette.gold500})`;
const SHADOW_IMAGE = "radial-gradient(ellipse at center, rgba(0,0,0,0.6), rgba(0,0,0,0) 70%)";

/** Eight cream inserts on the outer ring, the way the design's conic stripes fall. */
const INSERTS = Array.from({ length: 8 }, (_, index) => 11 + 9 + index * 45);

function CoinFace() {
  return (
    <View style={[styles.coinLayer, styles.faceRing]}>
      {INSERTS.map((deg) => (
        <View key={deg} style={[styles.insertArm, { transform: [{ rotate: `${deg}deg` }] }]}>
          <View style={styles.insert} />
        </View>
      ))}
      <View style={[styles.faceInner, backgroundImage(FACE_GOLD)]}>
        <View style={styles.faceDash} />
        <Text style={styles.faceLetter}>W</Text>
      </View>
    </View>
  );
}

/* ── styles ───────────────────────────────────────────────────────── */

const INSERT_LENGTH = 22;
const RING = 14;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: palette.felt500,
    paddingHorizontal: spacing.gutter,
  },
  body: {
    alignItems: "center",
    alignSelf: "center",
    flex: 1,
    justifyContent: "center",
    maxWidth: layout.maxContentWidth,
    width: "100%",
  },
  coinStage: { alignItems: "center", marginBottom: spacing.xxxl },
  tilt: {
    height: COIN,
    transform: [{ perspective: 600 }, { rotateX: "16deg" }],
    width: COIN,
  },
  coinLayer: { ...StyleSheet.absoluteFill, borderRadius: COIN / 2 },
  edge: { backgroundColor: palette.gold400, overflow: "hidden" },
  rimBand: { backgroundColor: palette.cream200, left: 0, position: "absolute", right: 0 },
  faceShade: { backgroundColor: "#000" },
  faceRing: {
    alignItems: "center",
    backgroundColor: palette.gold400,
    borderColor: palette.gold600,
    borderWidth: 3,
    justifyContent: "center",
    overflow: "hidden",
  },
  insertArm: {
    alignItems: "center",
    // Inside the 3-point border: a coin-high arm turned about the coin's centre.
    height: COIN - 6,
    left: (COIN - 6 - INSERT_LENGTH) / 2,
    position: "absolute",
    top: 0,
    width: INSERT_LENGTH,
  },
  insert: { backgroundColor: palette.cream100, height: RING - 3, width: INSERT_LENGTH },
  faceInner: {
    alignItems: "center",
    borderColor: palette.gold600,
    borderRadius: (COIN - RING * 2) / 2,
    borderWidth: 3,
    height: COIN - RING * 2,
    justifyContent: "center",
    width: COIN - RING * 2,
  },
  faceDash: {
    borderColor: "rgba(43,24,16,0.45)",
    borderRadius: (COIN - 68) / 2,
    borderStyle: "dashed",
    borderWidth: 2,
    height: COIN - 68,
    position: "absolute",
    width: COIN - 68,
  },
  faceLetter: {
    color: palette.tileInk,
    fontFamily: fonts.arcade,
    fontSize: 46,
    lineHeight: 52,
    textShadowColor: "rgba(251,230,166,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  coinShadow: { borderRadius: 55, height: 14, marginTop: 22, width: 110 },
  status: { alignItems: "center", marginBottom: spacing.xxl, width: "100%" },
  message: {
    color: palette.cream100,
    fontFamily: fonts.arcade,
    fontSize: 28,
    letterSpacing: 0.5,
    lineHeight: 32,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  detail: {
    color: palette.cream400,
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  tipCard: {
    backgroundColor: "rgba(2,10,7,0.45)",
    borderColor: "rgba(231,199,90,0.22)",
    borderRadius: 18,
    borderWidth: 1,
    paddingBottom: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
    width: "100%",
  },
  tipHead: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  tipKicker: { color: palette.gold200, fontFamily: fonts.arcade, fontSize: 13, letterSpacing: 1.5 },
  tipRule: { backgroundColor: "rgba(231,199,90,0.2)", flex: 1, height: 1 },
  tipCount: { color: palette.cream400, fontFamily: fonts.sansBold, fontSize: 11 },
  tipText: { color: palette.cream100, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, minHeight: 66 },
  nextTip: { alignSelf: "flex-end", paddingHorizontal: 2, paddingVertical: 6 },
  nextTipText: { color: palette.gold200, fontFamily: fonts.sansBold, fontSize: 13 },
  pressed: { opacity: 0.7 },
  slow: { alignItems: "center", gap: spacing.md },
});
