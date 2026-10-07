import { useMemo, type ReactNode } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RackTileBack } from "@/components/game";
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
  PLATE_OVER,
  seatDirection,
  seatMetrics,
  type SeatMetrics,
} from "../seat-metrics";

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
    plate: {
      borderRadius: m.pillRadius * 2,
      borderWidth: m.scale,
      gap: m.stackGap,
      marginTop: m.nameGap,
      maxWidth: m.width,
      paddingHorizontal: m.pillPadX,
      paddingVertical: m.scale,
      zIndex: 1,
    },
    // Stacked seats pull the plate up over the avatar's rim, the approved tabletop look.
    plateOver: { marginTop: -m.avatar * PLATE_OVER },
    plateName: { fontSize: m.nameSize, lineHeight: m.nameLine },
    stackRow: { gap: m.stackGap },
    coin: {
      borderRadius: m.stackSize / 2,
      borderWidth: m.scale,
      height: m.stackSize,
      width: m.stackSize,
    },
    statusRow: { gap: m.badgeGap, marginTop: m.pillGap },
    statusPill: {
      borderRadius: 999,
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
 * (`seat-metrics.ts`), with its nameplate, rack and status badge under it — or beside it, for
 * the seats at the top and bottom of the table (`seatDirection`). An opponent dealt in keeps
 * its two tiles standing in the rack (`dealt`, STO-532); the hero's tiles live in the word
 * builder, and a folded or busted seat has none to show. With `onPress` the whole seat is the
 * control; without it the seat is presentational — a seat that looks tappable but goes nowhere
 * is worse than one that never was.
 */
export function PlayerSeat({
  seat,
  anchor,
  seatCount,
  size,
  appearanceWidth,
  dealt = true,
  onPress,
}: SeatSlot<GamePlayer> & { dealt?: boolean; onPress?: (player: GamePlayer) => void }) {
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
  // The rack shows for a dealt-in opponent only: the hero's tiles sit in the word builder,
  // and a folded or busted seat has handed them back.
  const rack = dealt && !seat.isHero && !out;
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
          {/* The nameplate: over the avatar's lower rim when the labels stack under it. */}
          <View style={[styles.plate, scaled.plate, firstLabel, !beside && scaled.plateOver]}>
            <Text numberOfLines={1} style={[styles.plateName, scaled.plateName]}>
              {seat.isHero ? "YOU" : seat.name.toUpperCase()}
            </Text>
            <View style={[styles.stackRow, scaled.stackRow]}>
              <View style={[styles.coin, scaled.coin]} />
              <Text style={[styles.stack, scaled.stack]}>{formatAmount(seat.stack).replace("$", "")}</Text>
            </View>
          </View>
          {rack ? <RackLayers m={metrics} /> : null}
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

/** The rack's art, shared by the wood and by the lip that re-draws over the tiles' feet. */
const RACK_ART = require("../../../../../assets/images/ui/v2/opponent-rack-3-tight.png");

/**
 * The opponent rack (STO-532) as three sibling layers of the label column — never one nested
 * box, which the web's implicit stacking contexts would sink under the plate: the wood sits
 * under the plate's edge, the standing tiles rise above it, and the lip re-draws the rack's
 * bottom rail over their feet. The tiles and the lip are pinned to the column's bottom, one
 * badge-height up from its end, so they track the badge however the plate is styled.
 */
function RackLayers({ m }: { m: SeatMetrics }) {
  const badge = m.pillGap + m.pillPadY * 2 + m.pillBorder * 2 + m.statusLine;
  return (
    <>
      <Image
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        contentFit="contain"
        source={RACK_ART}
        style={[styles.rackWood, { height: m.rackH, marginTop: -m.rackTuck, width: m.rackW }]}
      />
      <View style={[styles.rackTiles, { bottom: badge + m.rackFeet, gap: m.rackW / 38 }]}>
        <RackTileBack width={(m.rackW * 64) / 190} />
        <RackTileBack width={(m.rackW * 64) / 190} />
      </View>
      <View pointerEvents="none" style={[styles.rackLip, { bottom: badge, height: m.rackLip }]}>
        <Image
          contentFit="contain"
          source={RACK_ART}
          style={{ bottom: 0, height: m.rackH, position: "absolute", width: m.rackW }}
        />
      </View>
    </>
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
  // The nameplate (STO-532): a dark plate with a gold-tinted rim — the reference's banner —
  // carrying the name and, on a second line, a coin and the stack as a plain count.
  plate: {
    alignItems: "center",
    backgroundColor: "#2b1d10",
    borderColor: "rgba(214,178,102,0.5)",
  },
  plateName: { color: "#fff6e3", fontFamily: fonts.arcade },
  stackRow: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  coin: { backgroundColor: "#f2c14e", borderColor: "#8a5a16" },
  stack: { color: "#fdf3d8", fontFamily: fonts.arcade },
  statusPill: {
    backgroundColor: "rgba(20,14,8,0.78)",
    borderColor: "rgba(232,220,192,0.28)",
  },
  statusText: { color: palette.cream200, fontFamily: fonts.arcade },
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
  // The rack's sibling z-order with the plate (zIndex 1): the wood ducks under its edge,
  // the standing tiles and the lip rise above it.
  rackWood: { zIndex: 0 },
  rackTiles: { flexDirection: "row", position: "absolute", zIndex: 2 },
  rackLip: { left: 0, overflow: "hidden", position: "absolute", right: 0, zIndex: 3 },
});
