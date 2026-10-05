import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChipSprite } from "@/components/chip/chip-sprite";
import { chipToneForAmount } from "@/components/chip/chip-value";

import type { SeatSlot } from "@/components/table";
import {
  colors,
  elevation,
  fonts,
  glow,
  layout,
  palette,
} from "@/constants/theme";
import { formatAmount } from "@/lib/format";

import type { GamePlayer, PlayerRole, PlayerStatus } from "../game-types";
import { SeatBeam } from "./seat-beam";
import {
  betChipOffset,
  seatDirection,
  seatMetrics,
  type SeatMetrics,
} from "../seat-metrics";
import { ArcadeLabelBand } from "./label-band";

const STATUS_LABEL: Record<PlayerStatus, string> = {
  waiting: "WAITING",
  "your-turn": "YOUR TURN",
  thinking: "THINKING...",
  check: "CHECK",
  call: "CALL",
  bet: "BET",
  raise: "RAISE",
  fold: "FOLD",
  "all-in": "ALL-IN",
  busted: "BUSTED",
  winner: "WINNER",
  ready: "READY",
};
const ROLE_LABEL: Record<PlayerRole, string> = {
  dealer: "D",
  "small-blind": "SB",
  "big-blind": "BB",
};

/** A seat's measures turned into styles, for one felt width: every seat at the table shares them. */
function seatStyles(m: SeatMetrics) {
  return StyleSheet.create({
    // The column's top is the avatar's top, pulled up half an avatar and left half a column: the
    // avatar's centre is the anchor, however tall the labels under it grow.
    seat: {
      left: -m.width / 2,
      top: -m.avatar / 2,
      width: m.width,
    },
    // A seat with its labels beside the avatar is one avatar tall — the labels, centred on it,
    // may stand past that — and starts at the avatar's left edge (labels on the right) or at the
    // labels' (labels on the left), so the avatar's centre is still the anchor.
    seatRight: {
      gap: m.besideGap,
      height: m.avatar,
      left: -m.avatar / 2,
      top: -m.avatar / 2,
      width: m.avatar + m.besideGap + m.width,
    },
    seatLeft: {
      gap: m.besideGap,
      height: m.avatar,
      left: -(m.width + m.besideGap + m.avatar / 2),
      top: -m.avatar / 2,
      width: m.avatar + m.besideGap + m.width,
    },
    labelsBeside: { width: m.width },
    labelBesideFirst: { marginTop: 0 },
    avatar: {
      borderRadius: m.avatar / 2,
      borderWidth: m.avatarBorder,
      height: m.avatar,
      width: m.avatar,
    },
    avatarLit: { borderWidth: m.avatarBorderLit },
    initials: { fontSize: m.initials, lineHeight: m.initials * 1.2 },
    roleRow: { gap: m.badgeGap, right: m.badgeRight, top: m.badgeTop },
    roleBadge: {
      borderRadius: m.badge / 2,
      borderWidth: m.scale,
      height: m.badge,
      width: m.badge,
    },
    roleText: { fontSize: m.badgeText, lineHeight: m.badgeText * 1.2 },
    playerName: {
      fontSize: m.nameSize,
      letterSpacing: m.nameTracking,
      lineHeight: m.nameLine,
      marginTop: m.nameGap,
      maxWidth: m.width,
      borderRadius: m.pillRadius,
      paddingHorizontal: m.pillPadX * 0.75,
    },
    statusRow: { gap: m.badgeGap, marginTop: m.pillGap },
    statusPill: {
      borderRadius: m.pillRadius,
      borderWidth: m.pillBorder,
      paddingHorizontal: m.pillPadX,
      paddingVertical: m.pillPadY,
    },
    statusText: {
      fontSize: m.statusSize,
      letterSpacing: m.statusTracking,
      lineHeight: m.statusLine,
    },
    stack: { fontSize: m.stackSize, lineHeight: m.stackLine },
    // The band's own padding is sized for a caption; the stack's fade grows with its digits.
    stackBand: {
      marginTop: m.stackGap,
      paddingHorizontal: m.stackSize * 1.4,
      paddingVertical: m.scale,
    },
    emptySeatLabel: {
      fontSize: m.statusSize,
      letterSpacing: m.emptyLabelTracking,
      lineHeight: m.statusLine,
      marginTop: m.nameGap,
    },
    betChip: {
      borderRadius: m.chip / 2,
      height: m.chip,
      width: m.chip,
    },
    betChipText: { fontSize: m.chipText, lineHeight: m.chipText * 1.2 },
  });
}

/** One set of seat styles per felt width: the table re-renders often, and resizes rarely. */
function useSeatStyles(tableWidth: number) {
  return useMemo(() => {
    const metrics = seatMetrics(tableWidth);
    return { metrics, scaled: seatStyles(metrics) };
  }, [tableWidth]);
}

/**
 * A seat at the felt. The avatar is centred on the seat's anchor and scales with the table
 * (`seat-metrics.ts`), with its name, status and stack under it — or beside it, for the seats at
 * the top and bottom of the table (`seatDirection`). With `onPress` the whole seat is the
 * control; without it the seat is presentational — a seat that looks tappable but goes nowhere is
 * worse than one that never was.
 */
export function PlayerSeat({
  seat,
  anchor,
  seatCount,
  size,
  appearanceWidth,
  onPress,
}: SeatSlot<GamePlayer> & { onPress?: (player: GamePlayer) => void }) {
  const { metrics, scaled } = useSeatStyles(appearanceWidth ?? size.width);
  const direction = seatDirection(anchor, seatCount);
  const beside = direction !== "stacked";
  const frame = beside
    ? [
        styles.seatBeside,
        direction === "left"
          ? [scaled.seatLeft, styles.seatBesideLeft]
          : scaled.seatRight,
      ]
    : [styles.seat, scaled.seat];
  // Beside the avatar, the labels are their own column, centred on it; under it, they hang in
  // the seat's column.
  const labelColumn = (children: ReactNode) =>
    beside ? (
      <View
        style={[
          styles.labelsBeside,
          scaled.labelsBeside,
          direction === "left" && styles.labelsBesideLeft,
        ]}
      >
        {children}
      </View>
    ) : (
      children
    );
  const firstLabel = beside && scaled.labelBesideFirst;
  if (!seat) {
    return (
      <View style={frame} testID="seat-open">
        <View style={[styles.avatar, scaled.avatar, styles.emptyAvatar]} />
        {labelColumn(
          <Text
            style={[styles.emptySeatLabel, scaled.emptySeatLabel, firstLabel]}
          >
            OPEN
          </Text>,
        )}
      </View>
    );
  }
  const active = seat.status === "your-turn";
  const winner = seat.status === "winner";
  const lit = active || winner;
  // The seat whose move it is — the hero's or any other — wears the beam while its turn runs.
  const turn = active || seat.status === "thinking";
  const statusColor = winner
    ? colors.goldHi
    : active
      ? colors.gold
      : colors.success;
  // A busted seat is dimmed like a folded one: it is at the table, and it is not playing.
  const out = seat.status === "fold" || seat.status === "busted";
  const statusLabel =
    seat.bet !== undefined && seat.bet > 0 && (seat.status === "bet" || seat.status === "raise")
      ? `${seat.status === "raise" ? "RAISE TO" : "BET"} ${formatAmount(seat.bet)}`
      : STATUS_LABEL[seat.status];
  const content = (
    <>
      <View style={styles.avatarWrap}>
        <SeatBeam
          active={turn}
          borderWidth={metrics.avatarBorderLit}
          glow={metrics.beamGlow}
          size={metrics.avatar}
        >
          <View
            style={[
              styles.avatar,
              scaled.avatar,
              { backgroundColor: seat.color },
              lit && [scaled.avatarLit, { borderColor: statusColor }],
              winner && glow(colors.goldHi, metrics.glow),
            ]}
            testID={`seat-avatar-${seat.id}`}
          >
            <Text style={[styles.initials, scaled.initials]}>
              {seat.initials}
            </Text>
          </View>
        </SeatBeam>
        {seat.roles?.length ? (
          <View style={[styles.roleRow, scaled.roleRow]}>
            {seat.roles.map((role) => (
              <View key={role} style={[styles.roleBadge, scaled.roleBadge]}>
                <Text style={[styles.roleText, scaled.roleText]}>
                  {ROLE_LABEL[role]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {labelColumn(
        <>
          <Text
            numberOfLines={1}
            style={[styles.playerName, scaled.playerName, firstLabel]}
          >
            {seat.name.toUpperCase()}
            {seat.isHero ? (
              <Text style={styles.youLabel}> {"·"} YOU</Text>
            ) : null}
          </Text>
          <View style={[styles.statusRow, scaled.statusRow]}>
            <View
              style={[
                styles.statusPill,
                scaled.statusPill,
                styles.actionPill,
                lit && { backgroundColor: statusColor, borderColor: statusColor },
              ]}
            >
              <Text
                accessibilityLabel={statusLabel}
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[
                  styles.statusText,
                  scaled.statusText,
                  lit && styles.statusTextLit,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
            {/* §44: a power used on this street rides beside the street's action. */}
            {seat.powerTag ? (
              <View
                style={[styles.statusPill, scaled.statusPill, styles.powerTag]}
                testID={`seat-power-tag-${seat.id}`}
              >
                <Text style={[styles.statusText, scaled.statusText, styles.powerTagText]}>
                  {seat.powerTag}
                </Text>
              </View>
            ) : null}
          </View>
          <ArcadeLabelBand
            style={scaled.stackBand}
            textStyle={scaled.stack}
          >
            {`$${seat.stack.toLocaleString()}`}
          </ArcadeLabelBand>
        </>,
      )}
      {seat.bet ? (
        <View
          style={[
            styles.betChip,
            scaled.betChip,
            betChipOffset(anchor, metrics, seatCount),
          ]}
        >
          <View style={StyleSheet.absoluteFill}>
            <ChipSprite tone={chipToneForAmount(seat.bet)} size={metrics.chip} />
          </View>
          <Text style={[styles.betChipText, scaled.betChipText]}>
            {seat.bet}
          </Text>
        </View>
      ) : null}
    </>
  );
  const seatStyle = [frame, out && styles.folded];
  const testID = `seat-${seat.id}`;
  if (!onPress) {
    return (
      <View style={seatStyle} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={`${seat.name}'s seat`}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={() => onPress(seat)}
      style={seatStyle}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Placed by `seatStyles`: its top-left is pulled back so the avatar centres on the anchor. */
  seat: { alignItems: "center", position: "absolute" },
  /** A seat whose labels sit beside the avatar, level with it: the top and bottom of the table. */
  seatBeside: {
    alignItems: "center",
    flexDirection: "row",
    position: "absolute",
  },
  seatBesideLeft: { flexDirection: "row-reverse" },
  labelsBeside: { alignItems: "flex-start" },
  labelsBesideLeft: { alignItems: "flex-end" },
  avatarWrap: { position: "relative" },
  avatar: {
    alignItems: "center",
    borderColor: palette.felt600,
    justifyContent: "center",
    ...elevation.card,
  },
  emptyAvatar: {
    backgroundColor: colors.surface,
    borderColor: colors.borderFaint,
    borderStyle: "dashed",
  },
  initials: { color: "#0c1410", fontFamily: fonts.sansBlack },
  /** The seat's markers, pinned to the avatar's corner and growing away from it: D, SB, BB. */
  roleRow: { flexDirection: "row", position: "absolute", zIndex: 2 },
  roleBadge: {
    alignItems: "center",
    backgroundColor: colors.textBright,
    borderColor: "#3a2815",
    justifyContent: "center",
  },
  roleText: { color: colors.onGold, fontFamily: fonts.monoBold },
  // A seat's labels may ride the rail's wood and gold band as well as the felt: the name sits on
  // a dark plate and the stack wears a dark halo, so both read on all three.
  playerName: {
    backgroundColor: "rgba(0,0,0,0.55)",
    color: colors.textBright,
    fontFamily: fonts.mono,
    overflow: "hidden",
  },
  youLabel: { color: colors.gold },
  statusPill: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(158,194,122,0.3)",
  },
  statusText: { color: palette.green500, fontFamily: fonts.monoBold },
  statusTextLit: { color: colors.onGold },
  statusRow: { alignItems: "center", flexDirection: "row", maxWidth: "100%" },
  actionPill: { flexShrink: 1, minWidth: 0 },
  // The power's tag in the Power Draw's own gold, so it reads as a power and not a bet.
  powerTag: { backgroundColor: "rgba(20,8,4,0.7)", borderColor: palette.gold400 },
  powerTagText: { color: colors.goldHi },
  folded: { opacity: 0.45 },
  emptySeatLabel: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
  },
  betChip: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    ...elevation.tile,
  },
  betChipText: {
    color: "#fff8dc",
    fontFamily: fonts.sansBlack,
    backgroundColor: "rgba(40, 5, 5, 0.85)",
    borderRadius: 3,
    paddingHorizontal: 2,
  },
});
