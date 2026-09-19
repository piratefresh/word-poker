/**
 * hud-top-bar.tsx — the in-hand HUD header: leave, balance, phase stamp, clock, and
 * the trailing help/settings pair.
 *
 * The balance is the only quantity up here that can be unknown, and each way of not
 * knowing it reads differently to a player: a stalled fetch painted as `$0` would tell
 * them they are broke. So every unknown state gets its own wording, and only the
 * signed-out chip is a control.
 */

import { type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  border,
  colors,
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
  balance: BalanceView;
  /** Back slot: this is the leave-table affordance. */
  onLeave?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  /** Only meaningful for the signed-out and unavailable balance states. */
  onBalancePress?: () => void;
  /** Spoken turn phrase, e.g. "Magnus to act". Passed through to the announcement hook. */
  turnPhrase?: string;
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
  turn,
  balance,
  onLeave,
  onHelp,
  onSettings,
  onBalancePress,
  turnPhrase,
  testID,
}: HudTopBarProps): ReactElement {
  return (
    <View style={styles.bar} testID={testID}>
      <GlassButton label="Leave the table" onPress={onLeave} size="leading">
        <BackChevron />
      </GlassButton>
      <BalanceChip balance={balance} onPress={onBalancePress} />
      <View style={styles.centre}>
        <Text style={styles.stamp}>{`PHASE ${phaseNumber} · ${PHASE_LABEL[phase]}`}</Text>
        <TurnClock phrase={turnPhrase} turn={turn} />
      </View>
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
function TurnClock({ turn, phrase }: { turn: TurnTimerView | null; phrase?: string }) {
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
        <Text style={[styles.clock, loud && styles.clockLoud]}>
          {formatClockMs(turn.remainingMs)}
        </Text>
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
