import {
  BlendColor,
  BlurMask,
  Canvas,
  Group,
  Image,
  LinearGradient,
  Mask,
  Oval,
  Rect,
  useImage,
  vec,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const GLASS = require("../../../../../assets/images/ui/v2/button/raise-button-3-forcefield-glass.png");

/** The glass art shares the button art's square canvas, so both draw in these units. */
const ART = 1254;
/** The dome's base ring and crown, in art units: the reveal runs from the rim up to the crown. */
const RIM = { x: 80, y: 320, width: 1105, height: 765 };
const BOTTOM = 1090;
const CROWN = 180;
/** How soft the reveal edge is, in art units. */
const FEATHER = 90;
/** The glass stays see-through enough for the lettering beneath. */
const GLASS_OPACITY = 0.8;
/** The ring's resting and pulsing strengths. */
const GLOW_REST = 0.55;
const GLOW_PEAK = 0.9;
const CYAN = "#5ff2ff";
/**
 * The glass art is fitted into the groove between the gold housing and the blue cap: an even
 * scale (never a stretch) and an offset, in button-art units. The constants above stay in the
 * glass image's own units.
 */
const GLASS_SCALE = 0.75;
const GLASS_OFFSET = { x: 146, y: 25 };

export interface WaitingShieldProps {
  /** Up while the table waits on another seat; down on the hero's turn. */
  active: boolean;
  size: number;
}

/**
 * A glass dome projected over the wager button while the table waits elsewhere: a cyan ring wakes
 * at the rim, the dome is unmasked from the rim up (never scaled), shimmers once, then breathes
 * every 2.5 s. On the hero's turn the mask runs back down into the housing. Every move starts from
 * wherever the last one left off, so a quick toggle reverses rather than flickers.
 */
export function WaitingShieldCanvas({ active, size }: WaitingShieldProps) {
  const glass = useImage(GLASS);
  const reduceMotion = useReducedMotion();
  const reveal = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      reveal.set(active ? 1 : 0);
      glow.set(active ? GLOW_REST : 0);
      return;
    }
    if (!active) {
      reveal.set(withTiming(0, { duration: 350, easing: Easing.in(Easing.cubic) }));
      glow.set(withTiming(0, { duration: 350 }));
      return;
    }
    // 0–120 ring wakes, 120–650 dome rises, 650–800 shimmer, then a pulse every 2.5 s.
    reveal.set(withDelay(120, withTiming(1, { duration: 530, easing: Easing.out(Easing.cubic) })));
    glow.set(withSequence(
      withTiming(GLOW_REST, { duration: 120 }),
      withDelay(530, withTiming(GLOW_PEAK, { duration: 75 })),
      withTiming(GLOW_REST, { duration: 75 }),
      withRepeat(withSequence(
        withDelay(1300, withTiming(GLOW_PEAK, { duration: 600, easing: Easing.inOut(Easing.sin) })),
        withTiming(GLOW_REST, { duration: 600, easing: Easing.inOut(Easing.sin) }),
      ), -1),
    ));
  }, [active, reduceMotion, reveal, glow]);

  useEffect(() => () => {
    cancelAnimation(reveal);
    cancelAnimation(glow);
  }, [reveal, glow]);

  // Opaque below the edge, clear above it; the edge climbs from under the rim past the crown.
  const edge = useDerivedValue(() => BOTTOM + FEATHER - reveal.get() * (BOTTOM + FEATHER - CROWN));
  const maskStart = useDerivedValue(() => vec(0, edge.get()));
  const maskEnd = useDerivedValue(() => vec(0, edge.get() - FEATHER));
  const sweepStart = useDerivedValue(() => vec(0, edge.get() + FEATHER / 2));
  const haloOpacity = useDerivedValue(() => glow.get() * 0.3);
  const sweepOpacity = useDerivedValue(() => Math.sin(reveal.get() * Math.PI));
  const transform = [
    { scale: size / ART },
    { translateX: GLASS_OFFSET.x },
    { translateY: GLASS_OFFSET.y },
    { scale: GLASS_SCALE },
  ];

  if (!glass) return null;
  return (
    <Canvas pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      <Group transform={transform}>
        <Oval {...RIM} color={CYAN} opacity={haloOpacity}>
          <BlurMask blur={40} style="normal" />
        </Oval>
        <Mask mask={(
          <Rect x={0} y={0} width={ART} height={ART}>
            <LinearGradient start={maskStart} end={maskEnd} colors={["white", "transparent"]} />
          </Rect>
        )}>
          <Image image={glass} x={0} y={0} width={ART} height={ART} opacity={GLASS_OPACITY} />
        </Mask>
        <Group opacity={sweepOpacity} blendMode="plus">
          <Mask mask={(
            <Rect x={0} y={0} width={ART} height={ART}>
              <LinearGradient start={sweepStart} end={maskEnd} colors={["transparent", "white", "transparent"]} />
            </Rect>
          )}>
            <Image image={glass} x={0} y={0} width={ART} height={ART}>
              <BlendColor color={CYAN} mode="srcIn" />
            </Image>
          </Mask>
        </Group>
      </Group>
    </Canvas>
  );
}
