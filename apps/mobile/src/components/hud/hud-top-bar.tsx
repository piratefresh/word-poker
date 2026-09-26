/**
 * hud-top-bar.tsx — the in-hand HUD header: leave, balance, phase stamp, clock, and
 * the trailing help/settings pair.
 *
 * The balance is the only quantity up here that can be unknown, and each way of not
 * knowing it reads differently to a player: a stalled fetch painted as `$0` would tell
 * them they are broke. So every unknown state gets its own wording, and only the
 * signed-out chip is a control.
 *
 * The header also carries the hand's first two effects. The phase block — the stamp and
 * the clock row together — rises into place once per phase change, and the digits breathe
 * while the hero is the one on turn. Both hang off the HUD's phase clock and the loop
 * gate rather than off a render, so a pot or a seat moving moves neither.
 */

import { useEffect, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  border,
  colors,
  duration,
  easing as motionEasing,
  fonts,
  fontSize,
  layout,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";
import { formatAmount, formatAmountCompact } from "@/lib/format";

import type { RoundPhase } from "@wordpoker/contracts";

import { PHASE_LABEL, type BalanceView } from "./hud-types";
import { formatClockMs, type TurnTimerView } from "./turn-clock";
import { useTurnAnnouncement } from "./use-turn-clock";

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

/** Glass treatment measured from the sketch: a translucent plate with a gold hairline. */
const GLASS_FILL = "rgba(0,0,0,0.3)";
const GLASS_EDGE = "rgba(212,175,55,0.3)";
const GLASS_EDGE_SOFT = "rgba(212,175,55,0.2)";

/**
 * Bar and control geometry, measured rather than derived — the felt below depends on it.
 * The bar's height is exported because it is the whole of the HUD's chrome: a screen
 * showing the HUD reserves exactly this much room for it.
 */
export const HUD_BAR_HEIGHT = 45;
const CHIP_HEIGHT = 30;
const CHIP_MAX_WIDTH = 92;
/** 30pt leading button, 28pt trailing pair. */
const GLASS_DIAMETER = { leading: 30, trailing: 28 } as const;

/** Loading needs a placeholder that cannot be mistaken for a figure. */
const LOADING_PLACEHOLDER = "···";
const UNAVAILABLE_PLACEHOLDER = "—";
const IDLE_CLOCK = "--:--";

/** The phase header's entrance, in points: the block settles into place rather than sliding. */
const PHASE_RISE = 8;
/** The timer's pulse floor. Never 0: the digits stay readable while they breathe. */
const TIMER_PULSE_OPACITY = 0.55;

/** The digits' breathing curve — the standard in-and-out, built from its tokens. */
const TIMER_PULSE_EASING = Easing.bezier(...motionEasing.inOut);

/** Eight teeth is the least that still reads as a cog at 14pt. */
const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    degrees,
    x1: 7 + cos * 4.2,
    y1: 7 + sin * 4.2,
    x2: 7 + cos * 6.2,
    y2: 7 + sin * 6.2,
  };
});

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
    transform: [{ translateY: interpolate(rise.get(), [0, 1], [PHASE_RISE, 0]) }],
  }));

  return (
    <View style={styles.bar} testID={testID}>
      <GlassButton label="Leave the table" onPress={onLeave} size="leading">
        <BackChevron />
      </GlassButton>
      <BalanceChip balance={balance} onPress={onBalancePress} />
      <Animated.View style={[styles.centre, entrance]}>
        <Text style={styles.stamp}>{stamp ?? `PHASE ${phaseNumber} · ${PHASE_LABEL[phase]}`}</Text>
        <TurnClock
          loopsEnabled={loopsOn}
          phrase={turnPhrase}
          reduceMotion={reduce}
          turn={turn}
        />
      </Animated.View>
      <View style={styles.trailing}>
        <GlassButton label="How to play" onPress={onHelp} size="trailing">
          <Text style={styles.helpGlyph}>?</Text>
        </GlassButton>
        <GlassButton label="Settings" onPress={onSettings} size="trailing">
          <GearGlyph />
        </GlassButton>
      </View>
    </View>
  );
}

interface GlassButtonProps {
  label: string;
  onPress?: () => void;
  size: keyof typeof GLASS_DIAMETER;
  children: ReactNode;
}

function GlassButton({ label, onPress, size, children }: GlassButtonProps) {
  const diameter = GLASS_DIAMETER[size];
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.glassButton,
        { height: diameter, width: diameter },
        size === "trailing" && styles.glassButtonTrailing,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function BalanceChip({ balance, onPress }: { balance: BalanceView; onPress?: () => void }) {
  if (balance.state === "signed-out") {
    // No handler means no destination, and a chip that looks tappable but does nothing
    // is worse than no chip at all.
    if (!onPress) return null;
    return (
      <Pressable
        accessibilityLabel="Sign in to see your balance"
        accessibilityRole="button"
        hitSlop={layout.hitSlop}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Text style={styles.chipActionText}>SIGN IN</Text>
      </Pressable>
    );
  }

  const ready = balance.state === "ready";
  return (
    <View accessibilityLabel={balanceLabel(balance)} accessibilityRole="text" accessible style={styles.chip}>
      <Text numberOfLines={1} style={[styles.chipValue, !ready && styles.chipPlaceholder]}>
        {balanceText(balance)}
      </Text>
    </View>
  );
}

/** Spoken balance. The compact value is on screen; the exact one is never dropped. */
function balanceLabel(balance: Exclude<BalanceView, { state: "signed-out" }>): string {
  switch (balance.state) {
    case "ready":
      return `Balance ${formatAmount(balance.amount)}`;
    case "loading":
      return "Balance loading";
    case "unavailable":
      return "Balance unavailable";
  }
}

function balanceText(balance: Exclude<BalanceView, { state: "signed-out" }>): string {
  switch (balance.state) {
    case "ready":
      return formatAmountCompact(balance.amount);
    case "loading":
      return LOADING_PLACEHOLDER;
    case "unavailable":
      return UNAVAILABLE_PLACEHOLDER;
  }
}

/** The countdown, plus — while a turn is live — its band-change announcement. */
function TurnClock({
  turn,
  phrase,
  loopsEnabled,
  reduceMotion,
}: {
  turn: TurnTimerView | null;
  phrase?: string;
  loopsEnabled: boolean;
  reduceMotion: boolean;
}) {
  // 1 is rest: with no animation running the digits are at full strength on the first frame.
  const pulse = useSharedValue(1);

  // The phrase is the hero's own status — `heroTurnPhrase` names a player exactly when that
  // player is to act — so the pair is what "the hero is on the clock" means. Nothing else
  // pulses: the clock is the hero's, and a loop left running behind a parked screen or an
  // expired turn is the thing the gate exists to stop (WP-412 AC9).
  const live = turn !== null && phrase !== undefined && loopsEnabled && !reduceMotion;

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
      <View accessibilityLabel="No turn in progress" accessible style={styles.clockRow}>
        <Text style={styles.clock}>{IDLE_CLOCK}</Text>
      </View>
    );
  }

  // Expiry is already `critical` by construction, but the view is caller-built, so the
  // flag is honoured on its own too.
  const loud = turn.urgency === "critical" || turn.expired;
  return (
    <>
      <View accessibilityLabel={clockLabel(turn)} accessible style={styles.clockRow}>
        {loud ? <Text style={styles.clockMark}>!</Text> : null}
        <Animated.Text style={[styles.clock, loud && styles.clockLoud, heartbeat]}>
          {formatClockMs(turn.remainingMs)}
        </Animated.Text>
      </View>
      <TurnAnnouncement phrase={phrase} turn={turn} />
    </>
  );
}

/**
 * Split out so the announcement hook is only called for a live turn: a null turn has
 * nothing to announce, and hooks cannot be skipped inside a branch.
 */
function TurnAnnouncement({ turn, phrase }: { turn: TurnTimerView; phrase?: string }) {
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

function BackChevron() {
  return (
    <Svg fill="none" height={13} viewBox="0 0 9 13" width={9}>
      <Polyline
        points="7.4,1.2 1.6,6.5 7.4,11.8"
        stroke={colors.gold}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={border.thin}
      />
    </Svg>
  );
}

function GearGlyph() {
  return (
    <Svg height={14} viewBox="0 0 14 14" width={14}>
      {GEAR_TEETH.map((tooth) => (
        <Line
          key={tooth.degrees}
          stroke={colors.gold}
          strokeLinecap="round"
          strokeWidth={1.4}
          x1={tooth.x1}
          x2={tooth.x2}
          y1={tooth.y1}
          y2={tooth.y2}
        />
      ))}
      <Circle cx={7} cy={7} fill="none" r={4.2} stroke={colors.gold} strokeWidth={1.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.sm,
    height: HUD_BAR_HEIGHT,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: spacing.xs,
  },
  glassButton: {
    alignItems: "center",
    backgroundColor: GLASS_FILL,
    borderColor: GLASS_EDGE,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    justifyContent: "center",
  },
  glassButtonTrailing: { borderColor: GLASS_EDGE_SOFT },
  chip: {
    alignItems: "center",
    backgroundColor: GLASS_FILL,
    borderColor: GLASS_EDGE,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: CHIP_HEIGHT,
    justifyContent: "center",
    maxWidth: CHIP_MAX_WIDTH,
    paddingHorizontal: spacing.sm,
  },
  chipValue: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 0.5,
  },
  chipPlaceholder: { color: colors.textDim },
  chipActionText: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.2,
  },
  centre: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  stamp: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.8,
  },
  clockRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs,
  },
  clock: {
    color: colors.textBright,
    fontFamily: fonts.monoBold,
    fontSize: 18,
    letterSpacing: 1,
    lineHeight: 20,
  },
  clockLoud: { color: colors.danger },
  clockMark: {
    color: colors.danger,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    lineHeight: 20,
  },
  helpGlyph: {
    color: colors.gold,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
  trailing: {
    flexDirection: "row",
    gap: 6,
  },
  // Pulled out of the row's flow rather than collapsed: a zero-sized node can be
  // dropped from the platform accessibility tree, and this one has to survive to be
  // announced.
  announcement: {
    opacity: 0,
    position: "absolute",
  },
  pressed: { opacity: opacity.pressed },
});
