/**
 * hud-top-bar.tsx — the in-hand HUD header: the phase banner, with the stamp on the felt's
 * caption band above it and the clock on its plate, flanked by the controls (leave and balance on the left, the
 * help/settings pair on the right) level with the clock's plate.
 * The pieces live in `top-bar/`: the banner's geometry, its clock, the light in the clock's
 * glass, the balance chip and the glass buttons.
 *
 * The header also carries the hand's first two effects. The phase block — the stamp and
 * the clock row together — rises into place once per phase change, and the digits breathe
 * while the hero is the one on turn. Both hang off the HUD's phase clock and the loop
 * gate rather than off a render, so a pot or a seat moving moves neither.
 */

import { Image } from "expo-image";
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
  colors,
  duration,
  fonts,
  fontSize,
  easing as motionEasing,
  spacing,
} from "@/constants/theme";

import { LabelBand } from "@/components/screens/game/primitives/label-band";

import type { RoundPhase } from "@wordpoker/contracts";

import { PHASE_LABEL, type BalanceView } from "./hud-types";
import {
  BANNER,
  bannerLayout,
  CONTROL_ROW_HEIGHT,
  hudBarHeight,
} from "./top-bar/banner";
import { BannerClock } from "./top-bar/banner-clock";
import { BackChevron, GearGlyph, GlassButton } from "./top-bar/glass-button";
import { TimerGlass } from "./top-bar/timer-glass";
import type { TurnTimerView } from "./turn-clock";

export { hudBarHeight };

export interface HudTopBarProps {
  phase: RoundPhase;
  /** Phase ordinal for the stamp, 1-based. */
  phaseNumber: number;
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
  phaseNumber,
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
  const banner = bannerLayout(window);
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
      <View pointerEvents="none" style={banner.frame}>
        <Image
          accessible={false}
          contentFit="fill"
          source={BANNER}
          style={banner.art}
        />
        {/* Hung with the banner, not the lettering: the glass lights, it doesn't rise. */}
        <TimerGlass
          animate={loopsOn && !reduce}
          layout={banner.glass}
          turn={turn}
        />
        {/* Only the lettering rises on a phase change: the banner itself stays hung. */}
        <Animated.View style={[StyleSheet.absoluteFill, entrance]}>
          <View style={banner.stampPlate}>
            <LabelBand style={banner.stampBand} textStyle={banner.stamp}>
              {stamp ?? `PHASE ${phaseNumber} · ${PHASE_LABEL[phase]}`}
            </LabelBand>
          </View>
          <View style={banner.clockPlate}>
            <BannerClock
              clockStyle={banner.clock}
              loopsEnabled={loopsOn}
              phrase={turnPhrase}
              reduceMotion={reduce}
              turn={turn}
            />
          </View>
        </Animated.View>
      </View>
      {/* After the banner, so the controls draw over its pole ends and cloth. */}
      <View pointerEvents="box-none" style={[styles.bar, banner.bar]}>
        <GlassButton label="Leave the table" onPress={onLeave} size="leading">
          <BackChevron />
        </GlassButton>
        {/* <BalanceChip balance={balance} onPress={onBalancePress} /> */}
        <View style={styles.trailing}>
          <GlassButton label="How to play" onPress={onHelp} size="trailing">
            <Text style={styles.helpGlyph}>?</Text>
          </GlassButton>
          <GlassButton label="Settings" onPress={onSettings} size="trailing">
            <GearGlyph />
          </GlassButton>
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
    height: CONTROL_ROW_HEIGHT,
    left: 0,
    paddingHorizontal: 14,
    position: "absolute",
    right: 0,
  },
  helpGlyph: {
    color: colors.gold,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
  trailing: {
    flexDirection: "row",
    gap: 6,
    marginLeft: "auto",
  },
});
