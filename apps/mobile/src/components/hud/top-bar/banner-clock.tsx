/**
 * banner-clock.tsx — the countdown lettered on the banner's plate, plus — while a turn is
 * live — its band-change announcement. The digits breathe while the hero is on turn.
 */

import { useEffect } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  colors,
  duration,
  fonts,
  easing as motionEasing,
  spacing,
} from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { formatClockMs, type TurnTimerView } from "../turn-clock";
import { useTurnAnnouncement } from "../use-turn-clock";
import { ArcadeDigits } from "./arcade-digits";

const IDLE_CLOCK = "--:--";

/** The timer's pulse floor. Never 0: the digits stay readable while they breathe. */
const TIMER_PULSE_OPACITY = 0.55;

/** The digits' breathing curve — the standard in-and-out, built from its tokens. */
const TIMER_PULSE_EASING = Easing.bezier(...motionEasing.inOut);

export function BannerClock({
  turn,
  phrase,
  loopsEnabled,
  reduceMotion,
  clockStyle,
}: {
  turn: TurnTimerView | null;
  phrase?: string;
  /** The digits' size, scaled with the banner they are lettered on. */
  clockStyle?: TextStyle;
  loopsEnabled: boolean;
  reduceMotion: boolean;
}) {
  // 1 is rest: with no animation running the digits are at full strength on the first frame.
  const pulse = useSharedValue(1);

  // The phrase is the hero's own status — `heroTurnPhrase` names a player exactly when that
  // player is to act — so the pair is what "the hero is on the clock" means. Nothing else
  // pulses: the clock is the hero's, and a loop left running behind a parked screen or an
  // expired turn is the thing the gate exists to stop (WP-412 AC9).
  const live =
    turn !== null && phrase !== undefined && loopsEnabled && !reduceMotion;

  useEffect(() => {
    cancelAnimation(pulse);
    if (!live) {
      pulse.set(1);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(TIMER_PULSE_OPACITY, {
          duration: duration.timerPulse / 2,
          easing: TIMER_PULSE_EASING,
        }),
        -1,
        true,
      ),
    );
    return () => {
      cancelAnimation(pulse);
      pulse.set(1);
    };
  }, [live, pulse]);
  const heartbeat = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), [0, 1], [0, 1]),
  }));

  if (!turn) {
    return (
      <View
        accessibilityLabel="No turn in progress"
        accessible
        id={webTestID("turn-clock")}
        style={styles.clockRow}
        testID="turn-clock"
      >
        <ArcadeDigits style={clockStyle}>{IDLE_CLOCK}</ArcadeDigits>
      </View>
    );
  }

  // Expiry is already `critical` by construction, but the view is caller-built, so the
  // flag is honoured on its own too.
  const loud = turn.urgency === "critical" || turn.expired;
  return (
    <>
      <View
        accessibilityLabel={clockLabel(turn)}
        accessible
        id={webTestID("turn-clock")}
        style={styles.clockRow}
        testID="turn-clock"
      >
        {loud ? (
          <Text
            style={[
              styles.clockMark,
              {
                fontSize: clockStyle?.fontSize,
                lineHeight: clockStyle?.lineHeight,
              },
            ]}
          >
            !
          </Text>
        ) : null}
        <Animated.View style={heartbeat}>
          <ArcadeDigits loud={loud} style={clockStyle}>
            {formatClockMs(turn.remainingMs)}
          </ArcadeDigits>
        </Animated.View>
      </View>
      <TurnAnnouncement phrase={phrase} turn={turn} />
    </>
  );
}

/**
 * Split out so the announcement hook is only called for a live turn: a null turn has
 * nothing to announce, and hooks cannot be skipped inside a branch.
 */
function TurnAnnouncement({
  turn,
  phrase,
}: {
  turn: TurnTimerView;
  phrase?: string;
}) {
  const message = useTurnAnnouncement(turn, phrase);
  return (
    <Text accessibilityLiveRegion="polite" style={styles.announcement}>
      {message ?? ""}
    </Text>
  );
}

/** Spoken clock: the digits alone are noise, so the band is said out loud. */
function clockLabel(turn: TurnTimerView): string {
  if (turn.expired) return "Time is up";
  const seconds = Math.ceil(turn.remainingMs / 1000);
  const left = `${seconds} ${seconds === 1 ? "second" : "seconds"} left`;
  if (turn.urgency === "critical") return `${left}, hurry`;
  if (turn.urgency === "warn") return `${left}, running short`;
  return left;
}

const styles = StyleSheet.create({
  clockRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs,
  },
  // Lettered in the digits' face, with the same hard shadow they cast.
  clockMark: {
    color: colors.danger,
    fontFamily: fonts.arcade,
    textShadowColor: "rgba(24, 8, 0, 0.8)",
    textShadowOffset: { width: 1.5, height: 2 },
    textShadowRadius: 0,
  },
  // Pulled out of the row's flow rather than collapsed: a zero-sized node can be
  // dropped from the platform accessibility tree, and this one has to survive to be
  // announced.
  announcement: {
    opacity: 0,
    position: "absolute",
  },
});
