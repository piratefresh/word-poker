import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { PowerUpId } from "@wordpoker/contracts";

import { colors, easing, fonts, palette } from "@/constants/theme";
import type { PowerView } from "@/lib/power-view";
import { webTestID } from "@/lib/web-id";

import { POWER_CARD_ASPECT, PowerCard, powerCardLabel } from "./power-card";

/**
 * The reveal's beats, each measured from the moment the draw opens. One table of offsets rather
 * than a chain of callbacks, so the beats can overlap and a tap early in the reveal still lands.
 */
export const POWER_DRAW_BEATS = {
  /** The pack drops in over the felt. */
  packIn: 420,
  /** The top strip tears off, with the burst of light. */
  tearAt: 520,
  tear: 300,
  /** The first card rises out of the pack; each after it `stagger` later. */
  fanAt: 820,
  stagger: 130,
  rise: 420,
  /** The kept card's lift, then its flight to the action row; the others fall away meanwhile. */
  keptLift: 320,
  keptFlight: 480,
  /** Under reduced motion: the cards' fade in, and the kept card's fade out. */
  fade: 240,
} as const;

/** How long the kept beat holds the reveal on the felt after the draw has closed. */
export const POWER_DRAW_KEPT_MS = POWER_DRAW_BEATS.keptLift + POWER_DRAW_BEATS.keptFlight;

// Relative, as the felt's other art is: Jest maps `@/` to `src/` only.
const PACK_ART = require("../../../assets/images/ui/icons/wildpower-mode.png");

const GAP = 10;
const MAX_CARD_WIDTH = 150;

/** Which draw is on the felt: the same offers and clock are the same draw. */
function drawKey(draw: NonNullable<PowerView["draw"]>): string {
  return `${draw.endsAtMs}:${draw.offers.join(",")}`;
}

/**
 * §44's Power Draw as the hero sees it: a foil pack drops over the felt and tears open, the offers
 * fan out of it, and the hero keeps one — the kept card lifts and flies to the action row, the
 * rest fall away. A draw that runs out keeps the first offer and plays the same beat.
 *
 * The adapter's `draw` is the table's truth and closes the moment the seat has kept one (offline,
 * no other seat draws), so the reveal holds the last draw it was shown until its kept beat has
 * played; which card was kept comes from `held`, the power the table says the hero now holds.
 *
 * Fans any number of offers, so a mode that deals one card (Blind Draw) plays the same reveal.
 * Placed over the felt, never over the rack: it fills the region it is given and sizes the cards
 * to fit it, so the seat picks with its tiles in view.
 */
export function PowerDrawReveal({
  draw,
  held,
  onPick,
}: {
  draw: PowerView["draw"];
  /** The power the hero holds this hand, once the draw has settled one. */
  held: PowerUpId | null;
  onPick: (id: PowerUpId) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<{
    key: string;
    offers: readonly PowerUpId[];
    endsAtMs: number;
  } | null>(null);
  // The card the hero tapped, ahead of the table's answer: a second tap lands on nothing.
  const [tapped, setTapped] = useState<PowerUpId | null>(null);
  const [region, setRegion] = useState({ height: 0, width: 0 });

  // A new draw on the felt — the next hand's — replaces whatever the last one left behind.
  if (draw !== null && shown?.key !== drawKey(draw)) {
    setShown({ key: drawKey(draw), offers: draw.offers, endsAtMs: draw.endsAtMs });
    setTapped(null);
  }

  // Kept once the table says so: a pick still waiting on other seats, or a draw that has closed —
  // by a pick, or by the clock handing the seat the first offer.
  const kept = shown === null ? null : draw !== null ? draw.picked : (held ?? shown.offers[0] ?? null);

  // The draw closed on the felt: the kept beat plays out, then the reveal leaves.
  const closed = shown !== null && draw === null;
  useEffect(() => {
    if (!closed) return;
    const timer = setTimeout(() => setShown(null), reduceMotion ? POWER_DRAW_BEATS.fade : POWER_DRAW_KEPT_MS);
    return () => clearTimeout(timer);
  }, [closed, reduceMotion]);

  // The window is announced once, when it opens: what to do, and how long there is to do it.
  const opensEndingAtMs = shown?.endsAtMs ?? null;
  useEffect(() => {
    if (opensEndingAtMs === null) return;
    const seconds = Math.max(0, Math.round((opensEndingAtMs - Date.now()) / 1_000));
    AccessibilityInfo.announceForAccessibility(`Pick a power, ${seconds} seconds`);
  }, [opensEndingAtMs]);

  if (shown === null) return null;

  const count = shown.offers.length;
  const cardWidth = Math.max(
    0,
    Math.min(
      MAX_CARD_WIDTH,
      (region.width - GAP * (count + 1)) / Math.max(count, 1),
      (region.height - GAP * 2) / POWER_CARD_ASPECT,
    ),
  );

  return (
    <View
      accessibilityViewIsModal
      id={webTestID("power-draw")}
      onLayout={(event: LayoutChangeEvent) => {
        const { height, width } = event.nativeEvent.layout;
        setRegion({ height, width });
      }}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      testID="power-draw"
    >
      <Scrim closing={closed} />
      {cardWidth > 0 ? (
        <View pointerEvents="box-none" style={styles.stage}>
          {reduceMotion ? null : <Pack cardWidth={cardWidth} />}
          <View pointerEvents="box-none" style={[styles.fan, { gap: GAP }]}>
            {shown.offers.map((id, index) => (
              <OfferCard
                cardWidth={cardWidth}
                count={count}
                disabled={kept !== null || tapped !== null}
                fate={kept === null ? "offered" : kept === id ? "kept" : "dropped"}
                flightY={region.height}
                id={id}
                index={index}
                key={`${shown.key}:${id}`}
                onPress={() => {
                  setTapped(id);
                  onPick(id);
                }}
                reduceMotion={reduceMotion}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The felt dims behind the reveal and comes back as the kept card leaves. */
function Scrim({ closing }: { closing: boolean }) {
  const shade = useSharedValue(0);

  useEffect(() => {
    shade.value = withTiming(closing ? 0 : 1, { duration: POWER_DRAW_BEATS.packIn });
  }, [closing, shade]);

  const style = useAnimatedStyle(() => ({ opacity: shade.value }));

  // Fades out towards the community above and the rack below, so the dim has no hard edge.
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, style]}>
      <LinearGradient
        colors={["rgba(2,10,7,0)", "rgba(2,10,7,0.6)", "rgba(2,10,7,0.6)", "rgba(2,10,7,0)"]}
        locations={[0, 0.2, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * The foil pack: drops in with its glow, loses its top strip in a burst of light, and fades
 * behind the cards as they rise out of it. Pure motion — it takes no touches and says nothing to
 * a screen reader; the cards are the draw.
 */
function Pack({ cardWidth }: { cardWidth: number }) {
  const width = cardWidth * 1.15;
  const height = width * POWER_CARD_ASPECT;
  const drop = useSharedValue(0);
  const tear = useSharedValue(0);
  const burst = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    drop.value = withSpring(1, easing.springOvershoot);
    tear.value = withDelay(
      POWER_DRAW_BEATS.tearAt,
      withTiming(1, { duration: POWER_DRAW_BEATS.tear, easing: Easing.out(Easing.cubic) }),
    );
    burst.value = withDelay(
      POWER_DRAW_BEATS.tearAt,
      withSequence(
        withTiming(1, { duration: POWER_DRAW_BEATS.tear * 0.6 }),
        withTiming(0, { duration: POWER_DRAW_BEATS.tear * 1.4 }),
      ),
    );
    fade.value = withDelay(
      POWER_DRAW_BEATS.fanAt + POWER_DRAW_BEATS.stagger,
      withTiming(0, { duration: POWER_DRAW_BEATS.rise }),
    );
  }, [burst, drop, fade, tear]);

  const packStyle = useAnimatedStyle(() => ({
    opacity: Math.min(drop.value, 1) * fade.value,
    transform: [{ translateY: (1 - drop.value) * -60 }, { scale: 0.8 + drop.value * 0.2 }],
  }));
  const stripStyle = useAnimatedStyle(() => ({
    opacity: 1 - tear.value,
    transform: [
      { translateY: tear.value * -height * 0.35 },
      { translateX: tear.value * width * 0.25 },
      { rotate: `${tear.value * 28}deg` },
    ],
  }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value,
    transform: [{ scale: 0.4 + burst.value * 1.6 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.pack, { height, width }, packStyle]}>
      <View style={[styles.glow, { borderRadius: width, height: width * 1.3, width: width * 1.3 }]} />
      <LinearGradient
        colors={[palette.felt400, palette.felt500, palette.felt900]}
        style={[styles.packBody, { borderRadius: width * 0.08 }]}
      >
        <Image
          contentFit="contain"
          source={PACK_ART}
          style={{ height: width * 0.62, width: width * 0.62 }}
        />
        <Text style={[styles.packLabel, { fontSize: width * 0.11 }]}>WILD POWER</Text>
      </LinearGradient>
      <Animated.View style={[styles.packStrip, { height: height * 0.14 }, stripStyle]}>
        <View style={styles.packStripSeam} />
      </Animated.View>
      <Animated.View
        style={[
          styles.burst,
          { borderRadius: width, height: width, left: 0, top: -width * 0.35, width },
          burstStyle,
        ]}
      />
    </Animated.View>
  );
}

type Fate = "offered" | "kept" | "dropped";

/**
 * One offer: rises out of the pack to its place in the fan, then — once the table has settled the
 * draw — either lifts and flies down to the action row (the kept card) or dims and falls away.
 */
function OfferCard({
  id,
  index,
  count,
  cardWidth,
  fate,
  flightY,
  disabled,
  onPress,
  reduceMotion,
}: {
  id: PowerUpId;
  index: number;
  count: number;
  cardWidth: number;
  fate: Fate;
  /** How far the kept card flies to reach the action row: the height of the region it sits in. */
  flightY: number;
  disabled: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  // 0 in the pack, 1 in its place in the fan.
  const rise = useSharedValue(0);
  // 0 offered; 1 at the end of its fate's beat.
  const settle = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    rise.value = reduceMotion
      ? withTiming(1, { duration: POWER_DRAW_BEATS.fade })
      : withDelay(
          POWER_DRAW_BEATS.fanAt + index * POWER_DRAW_BEATS.stagger,
          withSpring(1, easing.spring),
        );
  }, [index, reduceMotion, rise]);

  useEffect(() => {
    if (fate === "offered") return;
    if (reduceMotion) {
      settle.value = withTiming(1, { duration: POWER_DRAW_BEATS.fade });
      return;
    }
    if (fate === "dropped") {
      settle.value = withTiming(1, { duration: POWER_DRAW_BEATS.keptLift, easing: Easing.in(Easing.quad) });
      return;
    }
    lift.value = withTiming(1, { duration: POWER_DRAW_BEATS.keptLift, easing: Easing.out(Easing.back(2)) });
    settle.value = withDelay(
      POWER_DRAW_BEATS.keptLift,
      withTiming(1, { duration: POWER_DRAW_BEATS.keptFlight, easing: Easing.in(Easing.cubic) }),
    );
  }, [fate, lift, reduceMotion, settle]);

  const offset = ((count - 1) / 2 - index) * (cardWidth + GAP);
  const style = useOfferStyle({ rise, settle, lift, fate, offset, flightY, cardWidth, reduceMotion });

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityLabel={powerCardLabel(id)}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: fate === "kept" }}
        disabled={disabled}
        id={webTestID(`power-offer-${id}`)}
        onPress={onPress}
        testID={`power-offer-${id}`}
      >
        <PowerCard id={id} width={cardWidth} />
        {fate === "kept" ? <View pointerEvents="none" style={[styles.keptGlow, { borderRadius: cardWidth * 0.08 }]} /> : null}
      </Pressable>
    </Animated.View>
  );
}

function useOfferStyle({
  rise,
  settle,
  lift,
  fate,
  offset,
  flightY,
  cardWidth,
  reduceMotion,
}: {
  rise: SharedValue<number>;
  settle: SharedValue<number>;
  lift: SharedValue<number>;
  fate: Fate;
  offset: number;
  flightY: number;
  cardWidth: number;
  reduceMotion: boolean;
}) {
  return useAnimatedStyle(() => {
    if (reduceMotion) {
      return { opacity: rise.value * (1 - settle.value) };
    }

    // Out of the pack: from the fan's middle, low and small, to the card's own place.
    const risen = {
      translateX: (1 - rise.value) * offset,
      translateY: (1 - rise.value) * cardWidth * 0.3,
      scale: 0.55 + rise.value * 0.45,
    };

    if (fate === "dropped") {
      return {
        opacity: Math.min(rise.value, 1) * (1 - settle.value),
        transform: [
          { translateX: risen.translateX },
          { translateY: risen.translateY + settle.value * cardWidth * 0.5 },
          { scale: risen.scale * (1 - settle.value * 0.15) },
        ],
      };
    }

    if (fate === "kept") {
      // Lifts and brightens, then shrinks as it flies down past the rack to the action row.
      return {
        opacity: 1 - settle.value * 0.9,
        zIndex: 1,
        transform: [
          { translateX: risen.translateX + settle.value * offset * 0.4 },
          { translateY: risen.translateY - lift.value * cardWidth * 0.12 + settle.value * flightY * 0.75 },
          { scale: risen.scale * (1 + lift.value * 0.08) * (1 - settle.value * 0.75) },
        ],
      };
    }

    return {
      opacity: Math.min(rise.value * 1.5, 1),
      transform: [
        { translateX: risen.translateX },
        { translateY: risen.translateY },
        { scale: risen.scale },
      ],
    };
  });
}

const styles = StyleSheet.create({
  scrim: { borderRadius: 24, overflow: "hidden" },
  stage: { alignItems: "center", flex: 1, justifyContent: "center" },
  fan: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  pack: { alignItems: "center", justifyContent: "center", position: "absolute" },
  glow: {
    backgroundColor: palette.gold300,
    opacity: 0.22,
    position: "absolute",
    shadowColor: palette.gold200,
    shadowOpacity: 0.9,
    shadowRadius: 40,
  },
  packBody: {
    alignItems: "center",
    borderColor: palette.gold300,
    borderWidth: 2,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  packLabel: {
    color: colors.gold,
    fontFamily: fonts.arcade,
    letterSpacing: 1.5,
    marginTop: 6,
  },
  packStrip: {
    backgroundColor: palette.gold400,
    borderColor: palette.gold100,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  packStripSeam: {
    borderBottomWidth: 1.5,
    borderColor: palette.gold600,
    borderStyle: "dashed",
  },
  burst: {
    backgroundColor: palette.gold050,
    position: "absolute",
    shadowColor: palette.gold100,
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  keptGlow: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    borderColor: palette.gold100,
    borderWidth: 2,
    shadowColor: palette.gold100,
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
});
