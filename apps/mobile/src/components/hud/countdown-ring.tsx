/**
 * countdown-ring.tsx — a turn's remaining budget drawn as one draining arc.
 *
 * Pure presentation: the ring is handed a resolved `TurnTimerView` and draws it.
 * It owns no timer, so it cannot drift from the clock the rest of the table reads.
 */

import type { ReactElement, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "@/constants/theme";

import type { TurnTimerView, TurnUrgency } from "./turn-clock";

const DEFAULT_SIZE = 44;
const DEFAULT_STROKE_WIDTH = 3;

/**
 * The critical band thickens the arc by a point, so urgency survives without
 * colour. The ring's radius insets for that extra thickness, which keeps the
 * stroke inside the box and stops the arc jumping when the band changes.
 */
const CRITICAL_STROKE_BONUS = 1;

const BAND_COLOR: Record<TurnUrgency, string> = {
  calm: colors.success,
  warn: colors.warning,
  critical: colors.danger,
};

/** The empty ring is the chrome hairline, so a drained turn still reads as HUD. */
const TRACK_STROKE = colors.border;

export interface CountdownRingProps {
  /** The live turn. The ring reads its own remaining fraction and urgency band. */
  view: TurnTimerView;
  /** Outer diameter in points. */
  size?: number;
  /** Arc thickness at the calm band; the critical band thickens it. */
  strokeWidth?: number;
  /** Content centred inside the ring, typically the mm:ss text. */
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The track plus the remaining share as a dash: the dash is one full
 * circumference, offset by the spent share, so a fresh turn is a closed loop and
 * an expired one is bare. An SVG circle's path begins at 3 o'clock, so the arc is
 * turned a quarter turn counter-clockwise to drain from 12 o'clock.
 *
 * Nothing here animates, and nothing should. The shared clock republishes every
 * 250 ms — every 1 s under reduced motion — so a props-driven arc is already
 * smooth, and it steps down by itself when motion is reduced. A timing animation
 * would race that cadence and would have to re-implement the preference. A paused
 * turn needs nothing either: the clock freezes `elapsedFraction` behind it.
 *
 * `expired` draws a drained ring rather than trusting a fraction that may lag it;
 * a fraction that cannot be read at all drains too, never NaN in an arc.
 */
export function CountdownRing({
  view,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  children,
  accessibilityLabel,
  testID,
}: CountdownRingProps): ReactElement {
  const thickness = view.urgency === "critical" ? strokeWidth + CRITICAL_STROKE_BONUS : strokeWidth;
  const radius = Math.max(0, (size - (strokeWidth + CRITICAL_STROKE_BONUS)) / 2);
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const spent = view.expired ? 1 : spentShare(view.elapsedFraction);
  // A ring with no label is decoration: it must not become a focusable node, and
  // the centred clock text carries the meaning by itself.
  const labelled = accessibilityLabel !== undefined;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={labelled ? "timer" : undefined}
      accessible={labelled}
      // Decorative over a seat, so taps belong to whatever is underneath.
      pointerEvents="none"
      style={[styles.ring, { height: size, width: size }]}
      testID={testID}
    >
      {radius > 0 ? (
        <Svg height={size} style={styles.arc} width={size}>
          {/* The track holds the calm thickness, so the critical arc reads heavier
              than the ring it drains into. */}
          <Circle
            cx={centre}
            cy={centre}
            fill="none"
            r={radius}
            stroke={TRACK_STROKE}
            strokeWidth={strokeWidth}
            testID={testID ? `${testID}-track` : undefined}
          />
          <Circle
            cx={centre}
            cy={centre}
            fill="none"
            r={radius}
            stroke={BAND_COLOR[view.urgency]}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * spent}
            strokeWidth={thickness}
            testID={testID ? `${testID}-progress` : undefined}
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** Spent share as 0..1. A fraction the clock cannot supply reads as fully spent. */
function spentShare(elapsedFraction: number): number {
  if (!Number.isFinite(elapsedFraction)) return 1;
  return Math.min(1, Math.max(0, elapsedFraction));
}

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center" },
  arc: { left: 0, position: "absolute", top: 0 },
});
