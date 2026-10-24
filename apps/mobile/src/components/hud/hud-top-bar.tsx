/**
 * hud-top-bar.tsx — the in-hand HUD header: one row with the wooden phase and timer capsule
 * centred between the corner groups — back on the left, the balance chip (when it is not
 * hanging under the capsule) and help on the right, so neither can reach the clock. The pieces live in `top-bar/`: the
 * capsule, its clock, the chip and the buttons.
 *
 * A balance that is the table's mode rather than a figure (free play) is not a readout sharing
 * the corner with the clock: in portrait it hangs under the capsule as its tag, over the room
 * below rather than in the bar's own height — the room's seats are placed clear of it
 * (`MODE_TAG_BLOCK`). A landscape bar keeps it beside the back button.
 *
 * The capsule rises into place once per phase change, and the digits breathe while the hero
 * is the one on turn. Both hang off the HUD's phase clock and the loop gate rather than off
 * a render, so a pot or a seat moving moves neither.
 */

import { useContext, type ReactElement } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
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

import { landscapeFrame, useScreenScale } from "@/components/screens/game/screen-scale";

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

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** Landscape's corner discs, and how far inside the table's edge the corners sit (mock 1a). */
const LANDSCAPE_DISC = 32;
const LANDSCAPE_CORNER = 8;

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
  // The context, not the hook: a bar drawn on its own (its tests) has no provider, and reads as
  // the web does, with no insets.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const landscape = window.width > window.height;
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

  const capsule = (stacked: boolean) => (
    <PhaseCapsule
      label={stamp ?? PHASE_LABEL[phase]}
      loopsEnabled={loopsOn}
      phrase={turnPhrase}
      reduceMotion={reduce}
      showClock={stamp === undefined}
      stacked={stacked}
      testID="phase-capsule"
      turn={turn}
    />
  );

  if (landscape) {
    // Mock 1a: the corners sit inside the table's top corners, 8 in from its edge — back and the
    // small plate on the left (the mode's tag hanging under the plate, as it hangs under the
    // portrait capsule), help on the right. The table's top seat has the middle to itself.
    const inset = landscapeFrame(window, insets, 0).side + LANDSCAPE_CORNER - spacing.md;
    return (
      <View style={{ height: hudBarHeight(window) }} testID={testID}>
        <View
          pointerEvents="box-none"
          style={[styles.bar, styles.barLandscape, { paddingHorizontal: inset }]}
        >
          <View style={[styles.corner, styles.leading]}>
            <WoodButton
              diameter={LANDSCAPE_DISC}
              label="Leave the table"
              onPress={onLeave}
              testID="hud-leave-button"
            >
              <BackChevron />
            </WoodButton>
            <Animated.View pointerEvents="none" style={[styles.capsuleSlot, entrance]}>
              {balance.state === "free-play" ? (
                <View testID="hud-mode-tag" style={[styles.modeTag, { top: 34 + MODE_TAG_GAP }]}>
                  <BalanceChip balance={balance} testID="hud-balance" />
                </View>
              ) : null}
              {capsule(true)}
            </Animated.View>
            {balance.state === "free-play" ? null : (
              <BalanceChip balance={balance} onPress={onBalancePress} testID="hud-balance" />
            )}
          </View>
          <View style={[styles.corner, styles.trailing]}>
            <WoodButton
              diameter={LANDSCAPE_DISC}
              label="How to play"
              onPress={onHelp}
              testID="hud-help-button"
            >
              <Text style={[styles.helpGlyph, styles.helpGlyphSmall]}>?</Text>
            </WoodButton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ height: hudBarHeight(window) }} testID={testID}>
      <View pointerEvents="box-none" style={[styles.bar, { top: BAR_TOP_PAD, height: CAPSULE_HEIGHT * scale }]}>
        <View style={[styles.corner, styles.leading]}>
          <WoodButton label="Leave the table" onPress={onLeave} testID="hud-leave-button">
            <BackChevron />
          </WoodButton>
        </View>
        {/* The capsule rises on a phase change; the corner buttons stay put. The two corner
            groups share the row's spare width equally, so the capsule sits at the window's
            centre and no corner control can overlap the clock — and the mode's tag, when
            there is one, hangs under the capsule as part of that same block. */}
        <Animated.View pointerEvents="none" style={[styles.capsuleSlot, entrance]}>
          {/* Drawn before the capsule so the capsule's foot overlaps the tag's top. */}
          {modeTag ? (
            <View testID="hud-mode-tag" style={[styles.modeTag, { top: CAPSULE_HEIGHT * scale + MODE_TAG_GAP }]}>
              <BalanceChip balance={balance} testID="hud-balance" />
            </View>
          ) : null}
          {capsule(false)}
        </Animated.View>
        {/* A tag sits under the capsule, so that one balance is not in this group — the
            numbers that are readouts, and the one chip that is a control, are. */}
        <View style={[styles.corner, styles.trailing]}>
          {modeTag ? null : (
            <BalanceChip balance={balance} onPress={onBalancePress} testID="hud-balance" />
          )}
          <WoodButton label="How to play" onPress={onHelp} testID="hud-help-button">
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
  capsuleSlot: { alignItems: "center" },
  /** Both corners grow alike, which is what centres the capsule between them. */
  corner: { flex: 1, flexDirection: "row", gap: 6 },
  leading: { justifyContent: "flex-start" },
  /** The mode's tag: centred under the capsule, out of the corner row's flow. */
  modeTag: { alignItems: "center", left: 0, position: "absolute", right: 0 },
  helpGlyph: {
    color: "#FFE7B0",
    fontFamily: fonts.arcade,
    fontSize: 22,
  },
  trailing: { justifyContent: "flex-end" },
  // The table starts 6 down; the corners 8 inside it.
  barLandscape: { alignItems: "flex-start", top: 6 + LANDSCAPE_CORNER },
  helpGlyphSmall: { fontSize: 17 },
});
