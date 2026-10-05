import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useId, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import type { PowerUpId } from "@wordpoker/contracts";

import { colors, fonts, palette } from "@/constants/theme";
import type { PowerView } from "@/features/table/power-view";
import { webTestID } from "@/lib/web-id";

import { POWER_CARD_ASPECT } from "./power-card";
import { POWER_DRAW_MOTION, revealAtFor } from "./power-draw-motion";
import { PowerImpact } from "./power-impact";
import { PowerOfferCard, type OfferFate } from "./power-offer-card";

export { POWER_DRAW_KEPT_MS, POWER_DRAW_MOTION } from "./power-draw-motion";

const { entrance, exit: EXIT, reduced: REDUCED } = POWER_DRAW_MOTION;

const MAX_CARD_WIDTH = 150;
/** The room the heading and the hint take above and below the row, and the region's margin. */
const HEADING_HEIGHT = 32;
const HINT_HEIGHT = 40;
const PAD = 12;
/** The share of a card its hit overshoots by, reserved so the row never clips mid-impact. */
const OVERSHOOT = entrance.peak - 1;

/** Which draw is on the felt: the same offers and clock are the same draw. */
function drawKey(draw: NonNullable<PowerView["draw"]>): string {
  return `${draw.endsAtMs}:${draw.offers.join(",")}`;
}

/**
 * The row's size in the region it is given: one row whatever the room, the cards as wide as they
 * can be up to `MAX_CARD_WIDTH` with room left for the hit's overshoot, the heading and the hint,
 * and the gaps closing in on a narrow screen.
 */
function rowFor(region: { height: number; width: number }, count: number) {
  const n = Math.max(count, 1);
  const gap = Math.min(16, Math.max(6, region.width * 0.03));
  const byWidth = (region.width - PAD * 2 - gap * (n - 1)) / (n + OVERSHOOT);
  const byHeight = (region.height - HEADING_HEIGHT - HINT_HEIGHT - PAD * 2) / (POWER_CARD_ASPECT * (1 + OVERSHOOT));
  return { cardWidth: Math.max(0, Math.min(MAX_CARD_WIDTH, byWidth, byHeight)), gap };
}

/**
 * §44's Power Draw as the hero sees it: the felt darkens, a pulse of light gathers, and the
 * offers land face up left to right, each with a hit of its own. Once the row has landed the
 * seat may choose; the kept card lifts with a stronger hit and flies down toward the action row
 * while the rest fall away. A draw that runs out keeps the first offer and plays the same exit.
 *
 * The adapter's `draw` is the table's truth: it names the kept card (`picked`) while the draw is
 * still open on other seats' choices, and closes the moment every seat has kept one — offline,
 * the moment the hero has. Once closed, which card was kept comes from `held`, the power the
 * table says the hero now holds. The reveal holds the last draw it was shown until the kept
 * card's exit has played, and a pick still waiting on other seats says so once its card has gone.
 *
 * Deals any number of offers, so a mode that deals one card (Blind Draw) plays the same reveal.
 * Placed over the felt, never over the rack: it fills the region it is given and sizes the row to
 * fit it, so the seat picks with its tiles in view.
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
  // The card under the pointer, the keyboard's focus or a finger.
  const [hovered, setHovered] = useState<PowerUpId | null>(null);
  // Which draw has finished its entrance, and which has finished its exit: a new draw is neither.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [exitedKey, setExitedKey] = useState<string | null>(null);
  const [region, setRegion] = useState({ height: 0, width: 0 });

  // A new draw on the felt — the next hand's — replaces whatever the last one left behind.
  if (draw !== null && shown?.key !== drawKey(draw)) {
    setShown({ key: drawKey(draw), offers: draw.offers, endsAtMs: draw.endsAtMs });
    setTapped(null);
    setHovered(null);
  }

  const key = shown?.key ?? null;
  // Kept once the table says so: a pick still waiting on other seats, or a draw that has closed —
  // by a pick, or by the clock handing the seat the first offer.
  const kept = shown === null ? null : draw !== null ? draw.picked : (held ?? shown.offers[0] ?? null);
  const closed = shown !== null && draw === null;
  const { cardWidth, gap } = rowFor(region, shown?.offers.length ?? 0);
  const laidOut = cardWidth > 0;

  // Selection opens once the row has landed. Every beat counts from the layout, so a resize
  // moves the cards without restarting the clock; reduced motion opens it at once.
  useEffect(() => {
    if (key === null || !laidOut || reduceMotion) return;
    const timer = setTimeout(() => setReadyKey(key), entrance.readyAt);
    return () => clearTimeout(timer);
  }, [key, laidOut, reduceMotion]);
  const ready = shown !== null && (reduceMotion || readyKey === shown.key);

  // The kept card's exit, once: closing a draw whose pick already played does not play it again.
  const keptKnown = kept !== null;
  useEffect(() => {
    if (key === null || !keptKnown) return;
    const timer = setTimeout(() => setExitedKey(key), reduceMotion ? REDUCED.fadeOut : EXIT.total);
    return () => clearTimeout(timer);
  }, [key, keptKnown, reduceMotion]);
  const exited = shown !== null && exitedKey === shown.key;

  // The window is announced once, when it opens: what to do, and how long there is to do it.
  const opensEndingAtMs = shown?.endsAtMs ?? null;
  useEffect(() => {
    if (opensEndingAtMs === null) return;
    const seconds = Math.max(0, Math.round((opensEndingAtMs - Date.now()) / 1_000));
    AccessibilityInfo.announceForAccessibility(`Pick a power, ${seconds} seconds`);
  }, [opensEndingAtMs]);

  if (shown === null || key === null || (closed && exited)) return null;

  const count = shown.offers.length;
  const cardHeight = cardWidth * POWER_CARD_ASPECT;
  const rowWidth = count * cardWidth + (count - 1) * gap;
  const slotX = (index: number) => index * (cardWidth + gap) + cardWidth / 2;
  const lit = tapped ?? hovered;
  const leaving = kept !== null;
  const animated = !reduceMotion;

  return (
    <View
      accessibilityViewIsModal={!exited}
      id={webTestID("power-draw")}
      onLayout={(event: LayoutChangeEvent) => {
        const { height, width } = event.nativeEvent.layout;
        setRegion({ height, width });
      }}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      testID="power-draw"
    >
      <Scrim key={`scrim:${key}`} leaving={leaving} reduceMotion={reduceMotion} />
      {laidOut ? (
        <View key={`stage:${key}`} pointerEvents="box-none" style={styles.stage}>
          <Heading fontSize={Math.min(26, Math.max(16, cardWidth * 0.16))} leaving={leaving} reduceMotion={reduceMotion} />
          <View pointerEvents="box-none" style={{ height: cardHeight, marginVertical: (cardHeight * OVERSHOOT) / 2, width: rowWidth }}>
            {/* The bursts sit under the whole row, so a card's light never covers its neighbour. */}
            {animated && !exited ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {leaving ? null : (
                  <View style={[styles.anchor, { left: rowWidth / 2, top: cardHeight / 2 }]}>
                    <PowerImpact delay={entrance.gatherAt} kind="gather" size={cardWidth * 1.6} />
                  </View>
                )}
                {shown.offers.map((id, index) =>
                  leaving && id !== kept ? null : (
                    <View key={`${key}:${id}:${leaving ? "pick" : "reveal"}`} style={[styles.anchor, { left: slotX(index), top: cardHeight / 2 }]}>
                      {leaving ? (
                        <PowerImpact delay={EXIT.impactAt} kind="pick" size={cardWidth * 2.9} />
                      ) : (
                        <PowerImpact delay={revealAtFor(index)} size={cardWidth * 2.3} />
                      )}
                    </View>
                  ),
                )}
              </View>
            ) : null}
            {/* Once the exit has played, the cards are gone: a seat still waiting has nothing to pick. */}
            <View pointerEvents="box-none" style={[styles.row, { gap }]}>
              {exited ? null : shown.offers.map((id, index) => {
                const fate: OfferFate = kept === null ? "offered" : kept === id ? "kept" : "dropped";
                return (
                  <PowerOfferCard
                    cardWidth={cardWidth}
                    dimmed={kept === null && lit !== null && lit !== id}
                    disabled={!ready || tapped !== null || kept !== null}
                    fate={fate}
                    flight={{ x: rowWidth / 2 - slotX(index), y: region.height / 2 + cardHeight * 0.1 }}
                    id={id}
                    index={index}
                    key={`${key}:${id}`}
                    lit={kept === null ? lit === id : kept === id}
                    onLight={(on) => setHovered((current) => (on ? id : current === id ? null : current))}
                    onPress={() => {
                      setTapped(id);
                      onPick(id);
                    }}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </View>
          </View>
          <View style={styles.hintSlot}>
            {ready && tapped === null && kept === null ? (
              <Hint reduceMotion={reduceMotion} testID="power-draw-ready" text="CHOOSE ONE POWER" />
            ) : exited && !closed ? (
              <Hint quiet reduceMotion={reduceMotion} testID="power-draw-waiting" text="WAITING FOR OTHER PLAYERS" />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The felt darkens behind the choices — soft at the edges, so the community above and the rack
 * below stay in view — and comes back as the kept card flies.
 */
function Scrim({ leaving, reduceMotion }: { leaving: boolean; reduceMotion: boolean }) {
  const gradientId = useId();
  const shade = useSharedValue(0);

  useEffect(() => {
    if (!leaving) {
      shade.value = withTiming(1, { duration: reduceMotion ? REDUCED.fadeIn : entrance.scrim });
    } else if (reduceMotion) {
      shade.value = withTiming(0, { duration: REDUCED.fadeOut });
    } else {
      shade.value = withDelay(EXIT.flightAt, withTiming(0, { duration: EXIT.flight }));
    }
    return () => cancelAnimation(shade);
  }, [leaving, reduceMotion, shade]);

  const style = useAnimatedStyle(() => ({ opacity: shade.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {/* Fade to transparent on every edge of the bounded felt, including desktop's sides. */}
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={gradientId} r="50%">
            <Stop offset="0" stopColor="#020a07" stopOpacity={0.65} />
            <Stop offset="0.5" stopColor="#020a07" stopOpacity={0.65} />
            <Stop offset="0.75" stopColor="#020a07" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#020a07" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="100" width="100" />
      </Svg>
    </Animated.View>
  );
}

/** "✦ WILD POWER ✦" over the row: in with the first card, out with the cards not kept. */
function Heading({ fontSize, leaving, reduceMotion }: { fontSize: number; leaving: boolean; reduceMotion: boolean }) {
  const shown = useSharedValue(0);

  useEffect(() => {
    if (!leaving) {
      shown.value = reduceMotion
        ? withTiming(1, { duration: REDUCED.fadeIn })
        : withDelay(entrance.revealAt, withTiming(1, { duration: entrance.heading }));
    } else {
      shown.value = reduceMotion
        ? withTiming(0, { duration: REDUCED.fadeOut })
        : withDelay(EXIT.dropAt, withTiming(0, { duration: EXIT.drop }));
    }
    return () => cancelAnimation(shown);
  }, [leaving, reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  const star = fontSize * 0.7;

  return (
    <Animated.View
      accessible
      accessibilityLabel="Wild power"
      accessibilityRole="header"
      style={[styles.heading, { height: HEADING_HEIGHT }, style]}
    >
      <Sparkle size={star} />
      <Text numberOfLines={1} style={[styles.headingText, { fontSize }]}>
        WILD POWER
      </Text>
      <Sparkle size={star} />
    </Animated.View>
  );
}

/** A four-pointed star, drawn rather than typed: the arcade face has no ✦. */
function Sparkle({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="-1 -1 2 2" width={size}>
      <Path d="M0 -1 L0.22 -0.22 L1 0 L0.22 0.22 L0 1 L-0.22 0.22 L-1 0 L-0.22 -0.22 Z" fill={palette.gold100} />
    </Svg>
  );
}

/**
 * The line under the row: "CHOOSE ONE POWER" on a gold pill once the seat may choose — the
 * readiness a flow waits on (`power-draw-ready`) — or, quieter, the wait on other seats.
 */
function Hint({
  text,
  testID,
  quiet = false,
  reduceMotion,
}: {
  text: string;
  testID: string;
  quiet?: boolean;
  reduceMotion: boolean;
}) {
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduceMotion ? REDUCED.fadeIn : entrance.hint });
    return () => cancelAnimation(shown);
  }, [reduceMotion, shown]);

  const style = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <Animated.View accessibilityLiveRegion="polite" id={webTestID(testID)} style={style} testID={testID}>
      {quiet ? (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>{text}</Text>
        </View>
      ) : (
        <LinearGradient
          colors={[palette.gold100, palette.gold300, palette.gold500]}
          style={styles.pill}
        >
          <Text style={styles.pillText}>{text}</Text>
        </LinearGradient>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: "center", flex: 1, justifyContent: "center", padding: PAD },
  heading: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  headingText: {
    color: palette.gold100,
    fontFamily: fonts.arcade,
    letterSpacing: 1.5,
    textShadowColor: "rgba(231,199,90,0.6)",
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 10,
  },
  anchor: { height: 0, position: "absolute", width: 0 },
  row: { alignItems: "center", flexDirection: "row", height: "100%", justifyContent: "center" },
  hintSlot: { alignItems: "center", height: HINT_HEIGHT, justifyContent: "center" },
  pill: {
    borderColor: palette.gold050,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingVertical: 6,
    shadowColor: palette.gold200,
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  pillText: { color: colors.onGold, fontFamily: fonts.arcade, fontSize: 15, letterSpacing: 1 },
  waiting: {
    backgroundColor: "rgba(2,10,7,0.7)",
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  waitingText: { color: colors.text, fontFamily: fonts.arcade, fontSize: 13, letterSpacing: 1 },
});
