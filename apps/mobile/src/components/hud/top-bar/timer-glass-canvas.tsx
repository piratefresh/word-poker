/**
 * timer-glass-canvas.tsx — the turn's light in the clock's glass. The banner's wood and gold stay
 * still; only the glass behind the digits lights up, from the middle out to both ends as the turn
 * runs down, turning from jade to amber to a muted red as it crosses the clock's urgency bands.
 *
 * The plate's glass is painted, not see-through, so the light cannot sit under the picture, and a
 * canvas over the picture cannot blend with it either (Skia only blends inside its own canvas).
 * So the canvas covers the glass alone, redraws that slice of the picture clipped to the glass's
 * outline, and screens the light over it, which keeps the glass's own grain and glints showing
 * through.
 */

import {
  BlurMask,
  Canvas,
  Group,
  Image,
  LinearGradient,
  Rect,
  Skia,
  useImage,
  vec,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { palette } from "@/constants/theme";

import { URGENCY_CRITICAL_AT, URGENCY_WARN_AT, type TurnTimerView } from "../turn-clock";
import { BANNER, type GlassLayout } from "./banner";

export interface TimerGlassProps {
  /** The active turn, or null between turns: then the glass stays dark. */
  turn: TurnTimerView | null;
  layout: GlassLayout;
  /**
   * Whether the light glides between the clock's ticks. Off (Reduce Motion, a parked screen) it
   * still shows how much of the turn is spent, stepping once per tick instead.
   */
  animate: boolean;
}

/** The light's colour through the turn: the table's jade, then amber, then a red kept muted. */
const JADE = [20, 140, 120] as const;
const AMBER = [201, 138, 46] as const;
const EMBER = [168, 69, 58] as const;
/**
 * The light is strongest behind the digits and softer toward the ends of the glass, and never so
 * strong that the cream digits wash out against it.
 */
const CORE_ALPHA = 0.6;
const END_ALPHA = 0.35;

const BAND_STOPS = [0, URGENCY_WARN_AT, URGENCY_CRITICAL_AT, 1];
const bandColors = (alpha: number) =>
  [JADE, JADE, AMBER, EMBER].map(([r, g, b]) => `rgba(${r}, ${g}, ${b}, ${alpha})`);
const CORE_COLORS = bandColors(CORE_ALPHA);
const END_COLORS = bandColors(END_ALPHA);

/** The gold glint riding each edge of the light, in image pixels and at its strongest. */
const GLINT_WIDTH = 28;
const GLINT_BLUR = 18;
const GLINT_OPACITY = 0.3;

export function TimerGlassCanvas({ turn, layout, animate }: TimerGlassProps) {
  const image = useImage(BANNER);
  const { width, height } = layout.box;

  const outline = useMemo(() => {
    const path = Skia.Path.Make();
    layout.outline.forEach(({ x, y }, i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
    path.close();
    return path;
    // The outline is read off the scale alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.scale]);

  // The spent share of the turn, 0..1. Each clock tick re-anchors it to the server-corrected
  // clock, and between ticks it glides on toward the turn's end at the clock's own rate.
  const fraction = turn === null ? 0 : turn.expired ? 1 : turn.elapsedFraction;
  const running = turn !== null && !turn.paused && !turn.expired;
  const remainingMs = turn?.remainingMs ?? 0;
  const progress = useSharedValue(fraction);

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(fraction);
    if (running && animate && remainingMs > 0) {
      progress.set(withTiming(1, { duration: remainingMs, easing: Easing.linear }));
    }
    return () => cancelAnimation(progress);
  }, [animate, fraction, progress, remainingMs, running]);

  const lightWidth = useDerivedValue(() => width * progress.get());
  const lightX = useDerivedValue(() => (width - lightWidth.get()) / 2);
  const lightColors = useDerivedValue(() => {
    const p = progress.get();
    const core = interpolateColor(p, BAND_STOPS, CORE_COLORS);
    const end = interpolateColor(p, BAND_STOPS, END_COLORS);
    return [end, core, end];
  });

  const glintWidth = GLINT_WIDTH * layout.scale;
  const leftGlintX = useDerivedValue(() => lightX.get() - glintWidth / 2);
  const rightGlintX = useDerivedValue(() => lightX.get() + lightWidth.get() - glintWidth / 2);
  // Gone at either end: no edge to ride before the light starts, or once it fills the glass.
  const glintOpacity = useDerivedValue(() =>
    interpolate(progress.get(), [0, 0.03, 0.97, 1], [0, GLINT_OPACITY, GLINT_OPACITY, 0]),
  );

  if (!image) return null;

  return (
    <Canvas pointerEvents="none" style={layout.box}>
      <Group clip={outline}>
        <Image fit="fill" image={image} {...layout.art} />
        <Rect blendMode="screen" height={height} width={lightWidth} x={lightX} y={0}>
          <LinearGradient colors={lightColors} end={vec(width, 0)} start={vec(0, 0)} />
        </Rect>
        <Group blendMode="screen" color={palette.gold200} opacity={glintOpacity}>
          <BlurMask blur={GLINT_BLUR * layout.scale} style="normal" />
          <Rect height={height} width={glintWidth} x={leftGlintX} y={0} />
          <Rect height={height} width={glintWidth} x={rightGlintX} y={0} />
        </Group>
      </Group>
    </Canvas>
  );
}
