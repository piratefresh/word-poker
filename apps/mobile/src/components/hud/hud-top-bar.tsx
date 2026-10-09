/**
 * hud-top-bar.tsx — the in-hand HUD header: one row with the wooden phase and timer capsule
 * centred between the corner groups — back on the left, the balance chip and the help button
 * on the right, so the chip can never reach the clock. The pieces live in `top-bar/`: the
 * capsule, its clock, the chip and the buttons.
 *
 * A balance that is the table's mode rather than a figure (free play) is not a readout sharing
 * the corner with the clock: in portrait it hangs under the capsule as its tag, over the room
 * below rather than in the bar's own height — the room's seats are placed clear of it
 * (`MODE_TAG_BLOCK`). A landscape bar keeps it beside the clock.
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

import { useScreenScale } from "@/components/screens/game/screen-scale";

import { PHASE_LABEL, type BalanceView } from "./hud-types";
import { BalanceChip } from "./top-bar/balance-chip";
import {
  BAR_TOP_PAD,
  CAPSULE_HEIGHT,
  MODE_TAG_GAP,
  hudBarHeight,
} from "./top-bar/banner";
import { PhaseCapsule } from "./top-bar/phase-capsule";
import { BackChevron, WoodButton } from "./top-bar/wood-button";
import type { TurnTimerView } from "./turn-clock";

export { hudBarHeight };

export interface HudTopBarProps {
  phase: RoundPhase;
  /** The active turn, or null between turns. */
  turn: TurnTimerView | null;
  /** Words for the stamp in place of the phase's, for a table with no hand dealt yet. */
  stamp?: string;
  balance: BalanceView;
  /**
   * Whether this header hangs the table's mode under the capsule. Decided above the felt
   * (`hangsModeTag`, and the room that has to seat its row below it): the bar draws the tag
   * where it is told rather than guessing at a room it cannot see.
   */
  modeTag?: boolean;
  /** Back slot: this is the leave-table affordance. */
  onLeave?: () => void;
  onHelp?: () => void;
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
  modeTag = false,
  onLeave,
  onHelp,
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
      <View pointerEvents="box-none" style={[styles.bar, { top: BAR_TOP_PAD, height: CAPSULE_HEIGHT * scale }]}>
        <WoodButton label="Leave the table" onPress={onLeave}>
          <BackChevron />
        </WoodButton>
        {/* The capsule rises on a phase change; the corner buttons stay put. It centres in
            the room the corner groups leave rather than across the whole window, so no
            corner control can overlap the clock — and the mode's tag, when there is one,
            hangs under the capsule as part of that same block. */}
        <Animated.View pointerEvents="none" style={[styles.capsuleSlot, entrance]}>
          {/* Drawn before the capsule so the capsule's foot overlaps the tag's top. */}
          {modeTag ? (
            <View style={[styles.modeTag, { top: CAPSULE_HEIGHT * scale + MODE_TAG_GAP }]}>
              <BalanceChip balance={balance} style={styles.modeTagChip} />
            </View>
          ) : null}
          <PhaseCapsule
            label={stamp ?? PHASE_LABEL[phase]}
            loopsEnabled={loopsOn}
            phrase={turnPhrase}
            reduceMotion={reduce}
            showClock={stamp === undefined}
            turn={turn}
          />
        </Animated.View>
        {/* A tag sits under the capsule, so that one balance is not in this group — the
            numbers that are readouts, and the one chip that is a control, are. */}
        <View style={styles.trailing}>
          {modeTag ? null : (
            <BalanceChip balance={balance} onPress={onBalancePress} />
          )}
          <WoodButton label="How to play" onPress={onHelp}>
            <Text style={styles.helpGlyph}>?</Text>
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
  capsuleSlot: { alignItems: "center", flex: 1 },
  /** The mode's tag: centred under the capsule, out of the corner row's flow. */
  modeTag: { alignItems: "center", left: 0, position: "absolute", right: 0 },
  /** The capsule's own felt-green inlay (`phase-capsule.tsx`), so the tag reads as hung off it. */
  modeTagChip: { backgroundColor: "#1E5A33", borderColor: "#123A21" },
  helpGlyph: {
    color: "#FFE7B0",
    fontFamily: fonts.arcade,
    fontSize: 22,
  },
  trailing: {
    flexDirection: "row",
    gap: 6,
  },
});
