/**
 * chip-layer.tsx — the chips on their way across the felt.
 *
 * One node per flight, each on its own path from a seat to the pot (or the pot back to a seat,
 * for a payout). The layer owns no geometry: every point comes from `useTableLayout`, and the
 * two ends of a flight are the seat anchor and the pot anchor resolved into the container the
 * layer fills — the same pixels the seats are already drawn at, at any width.
 *
 * The nodes sit above the felt and swallow nothing: `pointerEvents="none"` all the way down, so
 * a chip in the air never takes a tap meant for the seat it is passing. At rest there are no
 * nodes at all, because the felt that owns `flights` empties the array as they land — this
 * module reports a landing and never assumes anything about who listens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { ChipFlight } from "@/components/screens/game/game-types";
import { ChipSprite } from "@/components/chip/chip-sprite";
import { chipToneForAmount } from "@/components/chip/chip-value";
import { duration, easing as motionEasing } from "@/constants/theme";

import { useTableLayout } from "./poker-table";

export interface ChipLayerProps {
  /** The flights to draw, in the order they were committed. */
  flights: readonly ChipFlight[];
  /**
   * A flight that has landed, reported with its own id. The felt that handed the flight over is
   * the one that prunes it; the layer only ever says when the chips are down.
   */
  onFlightEnd?: (id: string) => void;
}

/**
 * The instant the last chip of a batch of `count` lands, counted from the batch's own start: the
 * beat every chip waits, the stagger between them, and one flight's own duration. The pot counts
 * up as they arrive, so the arithmetic lives here once rather than in the two places that need it.
 */
export function chipArrivalMs(count: number): number {
  return duration.chipDelay + (count - 1) * duration.chipStagger + duration.chipFlight;
}

/** The disc a flight draws. Geometry of this layer, not a place on the felt. */
const CHIP_DIAMETER = 24;
/** Where a chip starts: small and back at the seat, growing as it lands on the pot. */
const CHIP_START_SCALE = 0.55;
/** How much of the flight the chip spends fading in, before the travel reads at all. */
const CHIP_FADE_IN = 0.18;

const CHIP_EASING = Easing.bezier(...motionEasing.inOut);

export function ChipLayer({ flights, onFlightEnd }: ChipLayerProps) {
  const reduceMotion = useReducedMotion();
  const { layout, resolveContainer } = useTableLayout();

  // The felt hands the layer a fresh handler whenever it renders, and a chip in the air must not
  // restart because of it: the report goes through the latest one from here.
  const onEndRef = useRef(onFlightEnd);
  useEffect(() => {
    onEndRef.current = onFlightEnd;
  }, [onFlightEnd]);
  const reportEnd = useCallback((id: string) => onEndRef.current?.(id), []);

  // Reduced motion is a table with no flight in it at all: the chips are in the middle by the
  // time the pot is drawn. Reporting each one the instant it arrives is what keeps the felt's
  // array from filling with chips nothing will ever land.
  useEffect(() => {
    if (!reduceMotion) return;
    for (const flight of flights) reportEnd(flight.id);
  }, [flights, reduceMotion, reportEnd]);

  // A flight's stagger is its place in its own batch — the seats that committed on one street —
  // not its place in the whole array: a street's chips land one after another however many
  // flights the felt is still carrying from the streets before it. The batch is the part of the
  // id the batch shares, and the array is in emission order, which is seat order.
  const batches = useMemo(() => {
    const counts = new Map<string, number>();
    return flights.map((flight) => {
      const key = flight.id.split(":").slice(0, 2).join(":");
      const order = counts.get(key) ?? 0;
      counts.set(key, order + 1);
      return order;
    });
  }, [flights]);

  if (reduceMotion || flights.length === 0) return null;

  const pot = resolveContainer(layout.pot);

  return (
    <View pointerEvents="none" style={styles.layer} testID="chip-layer">
      {flights.map((flight, index) => {
        // A seat the felt cannot place gets no chip rather than a chip at (0, 0); the layout is
        // the only thing that says where a seat is.
        const seat = resolveContainer(layout.seats[flight.seatIndex] ?? layout.pot);
        // `in` is a seat's chips on their way to the middle; `out` is the same two points the
        // other way round, which is a payout leaving the pot for the seat it paid.
        const outbound = flight.direction === "out";
        return (
          <Flight
            amount={flight.amount}
            batchIndex={batches[index] ?? 0}
            from={outbound ? pot : seat}
            id={flight.id}
            key={flight.id}
            onEnd={reportEnd}
            to={outbound ? seat : pot}
          />
        );
      })}
    </View>
  );
}

/**
 * One chip, travelling. Its own progress value is the whole of its state, and its beat is frozen
 * when it mounts: a chip's stagger is its place in the batch it was committed with, so a sibling
 * landing beside it must not move a chip that is already in the air. The node is the flight's id,
 * so a re-render keeps both the node and the beat it left on.
 */
function Flight({
  amount,
  id,
  from,
  to,
  batchIndex,
  onEnd,
}: {
  amount: number;
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The flight's place among the seats that committed on its street, from 0. */
  batchIndex: number;
  onEnd: (id: string) => void;
}) {
  const progress = useSharedValue(0);
  const [beat] = useState(() => duration.chipDelay + batchIndex * duration.chipStagger);
  // A flight begins once, when its node appears: a re-render — the HUD's countdown ticks once a
  // second — carries a chip that is already in the air without touching it. The ref is what makes
  // that exact rather than incidental: the shared value is a dependency and a test renderer hands
  // out a fresh one on every render, so keying the start on the deps alone would re-fire it there.
  const flying = useRef(false);

  useEffect(() => {
    if (flying.current) return;
    flying.current = true;

    progress.set(
      withDelay(
        beat,
        withTiming(
          1,
          { duration: duration.chipFlight, easing: CHIP_EASING },
          (finished) => {
            // A worklet, so a frame callback never reaches for React: the landing is handed back
            // to JS, and that report — not an unmount, not a re-render — is what ends the flight.
            "worklet";
            if (finished) scheduleOnRN(onEnd, id);
          },
        ),
      ),
    );
  }, [beat, id, onEnd, progress]);

  const travel = useAnimatedStyle(() => {
    const p = progress.get();
    // At rest the chip is still at the seat, invisible: nothing is drawn until the beat is up.
    return {
      opacity: interpolate(p, [0, CHIP_FADE_IN], [0, 1]),
      transform: [
        { translateX: interpolate(p, [0, 1], [from.x - to.x, 0]) },
        { translateY: interpolate(p, [0, 1], [from.y - to.y, 0]) },
        { scale: interpolate(p, [0, 1], [CHIP_START_SCALE, 1]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.chip, { left: to.x, top: to.y }, travel]}
      testID={`chip-flight-${id}`}
    >
      <ChipSprite tone={chipToneForAmount(amount)} size={CHIP_DIAMETER} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  chip: {
    height: CHIP_DIAMETER,
    // Centred on the point it lands on: the travel is a transform, so the disc's own box is
    // pulled back over its anchor by margins rather than by a transform of its own.
    marginLeft: -CHIP_DIAMETER / 2,
    marginTop: -CHIP_DIAMETER / 2,
    position: "absolute",
    width: CHIP_DIAMETER,
  },
});
