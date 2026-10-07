/**
 * hud-top-bar.tsx — the in-hand HUD header: the wooden phase and timer capsule at the top
 * centre, flanked by round wooden back / help / settings buttons in the corners.
 * The pieces live in : the capsule, its clock, the balance chip and the buttons.
 *
 * The capsule rises into place once per phase change, and the digits breathe while the hero
 * is the one on turn. Both hang off the HUD's phase clock and the loop gate rather than off
 * a render, so a pot or a seat moving moves neither.
 */

import type { ReactElement } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  duration,
  fonts,
  easing as motionEasing,
  spacing,
} from "@/constants/theme";

import type { RoundPhase } from "@wordpoker/contracts";

import { useCompactControls, useScreenScale } from "@/components/screens/game/screen-scale";

import { PHASE_LABEL, type BalanceView } from "./hud-types";
import { BalanceChip } from "./top-bar/balance-chip";
import { BAR_TOP_PAD, CAPSULE_HEIGHT, hudBarHeight } from "./top-bar/banner";
import { PhaseCapsule } from "./top-bar/phase-capsule";
import { BackChevron, GearGlyph, WoodButton } from "./top-bar/wood-button";
import type { TurnTimerView } from "./turn-clock";

export { hudBarHeight };

export interface HudTopBarProps {
  phase: RoundPhase;
  /** The active turn, or null between turns. */
  turn: TurnTimerView | null;
  /** Words for the stamp in place of the phase's, for a table with no hand dealt yet. */
  stamp?: string;
  balance: BalanceView;
  /** Back slot: this is the leave-table affordance. */
  onLeave?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  /** Only meaningful for the signed-out and unavailable balance states. */
  onBalancePress?: () => void;
  /** Spoken turn phrase, e.g. "Magnus to act". Passed through to the announcement hook. */
  turnPhrase?: string;
  /**
   * The hand's phase clock, owned by the HUD. Optional so the bar still renders on its own:
   * without one it stands still rather than inventing a phase change to rise on.
   */
  tick?: SharedValue<number>;
  /** Whether the screen's loops may run. Absent means nothing has parked the screen. */
  loopsEnabled?: boolean;
  /** Overrides the OS reduced-motion value; the tests use it. */
  reduceMotion?: boolean;
  testID?: string;
}

/** The phase header's entrance, in points: the block settles into place rather than sliding. */
const PHASE_RISE = 8;

export function HudTopBar({
  phase,
  stamp,
  turn,
  balance,
  onLeave,
  onHelp,
  onSettings,
  onBalancePress,
  turnPhrase,
  tick,
  loopsEnabled,
  reduceMotion,
  testID,
}: HudTopBarProps): ReactElement {
  // The bar follows the HUD's clock, and a bar rendered without one holds a clock of its
  // own that never ticks: the hook is unconditional, so its order never depends on props.
  const localTick = useSharedValue(0);
  const window = useWindowDimensions();
  const scale = useScreenScale();
  const compact = useCompactControls();
  const clockTick = tick ?? localTick;
  const loopsOn = loopsEnabled ?? true;
  const systemReduceMotion = useReducedMotion();
  const reduce = reduceMotion ?? systemReduceMotion;

  // 1 is at rest: the block is legible and in place on its first frame, and a renderer that
  // never runs an animation simply leaves it there.
  const rise = useSharedValue(1);
  const fade = useSharedValue(1);

  // Restarted by the phase tick, never by a re-render: a pot change, a seat change or any
  // other render of the same phase does not move this block (WP-412 AC2).
  useAnimatedReaction(
    () => clockTick.get(),
    (current, previous) => {
      if (current === previous) return;
      if (reduce) {
        rise.set(1);
        fade.set(1);
        return;
      }
      // Continue from where it is: only a block already at rest re-enters from the top, so a
      // second phase landing mid-spring never snaps back to 8pt (STO-349 AC2).
      if (rise.get() >= 1) rise.set(0);
      rise.set(withSpring(1, motionEasing.springOvershoot));
      if (fade.get() >= 1) fade.set(0);
      fade.set(withTiming(1, { duration: duration.phaseIn }));
    },
    [reduce],
  );

  // Both readings go through `interpolate`: the shipped mock returns `undefined` there, so a
  // test render sees the block where it belongs rather than wherever an animation stopped.
  const entrance = useAnimatedStyle(() => ({
    opacity: interpolate(fade.get(), [0, 1], [0, 1]),
    transform: [
      { translateY: interpolate(rise.get(), [0, 1], [PHASE_RISE, 0]) },
    ],
  }));

  return (
    <View style={{ height: hudBarHeight(window) }} testID={testID}>
      {/* The capsule rises on a phase change; the corner buttons stay put. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.capsulePlate, { top: BAR_TOP_PAD, right: compact ? 48 : 0 }, entrance]}
      >
        <PhaseCapsule
          label={stamp ?? PHASE_LABEL[phase]}
          loopsEnabled={loopsOn}
          phrase={turnPhrase}
          reduceMotion={reduce}
          showClock={stamp === undefined}
          turn={turn}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.bar, { top: BAR_TOP_PAD, height: CAPSULE_HEIGHT * scale }]}>
        <WoodButton label="Leave the table" onPress={onLeave}>
          <BackChevron />
        </WoodButton>
        <BalanceChip balance={balance} onPress={onBalancePress} />
        <View style={styles.trailing}>
          <WoodButton label="How to play" onPress={onHelp}>
            <Text style={styles.helpGlyph}>?</Text>
          </WoodButton>
          <WoodButton label="Settings" onPress={onSettings}>
            <GearGlyph />
          </WoodButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: 14,
    position: "absolute",
    right: 0,
  },
  capsulePlate: { alignItems: "center", left: 0, position: "absolute", right: 0 },
  helpGlyph: {
    color: "#FFE7B0",
    fontFamily: fonts.arcade,
    fontSize: 22,
  },
  trailing: {
    flexDirection: "row",
    gap: 6,
    marginLeft: "auto",
  },
});
