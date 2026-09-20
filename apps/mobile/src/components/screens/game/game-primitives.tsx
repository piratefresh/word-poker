import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Tile } from "@/components/game";
import type { SeatSlot } from "@/components/table";
import {
  border,
  colors,
  duration,
  easing as motionEasing,
  elevation,
  fonts,
  glow,
  gradients,
  layout,
  opacity,
  palette,
  radius,
} from "@/constants/theme";
import type { GamePlayer, LetterTileData, PlayerRole, PlayerStatus } from "./game-types";

const STATUS_LABEL: Record<PlayerStatus, string> = {
  waiting: "WAITING",
  "your-turn": "YOUR TURN",
  thinking: "THINKING...",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
  fold: "FOLD",
  "all-in": "ALL-IN",
  busted: "BUSTED",
  winner: "WINNER",
};
const ROLE_LABEL: Record<PlayerRole, string> = {
  dealer: "D",
};

const SEAT_STACK_HEIGHT = 92;
const SEAT_AVATAR_SIZE = 38;
const SEAT_AVATAR_ANCHOR_OFFSET =
  (SEAT_STACK_HEIGHT - SEAT_AVATAR_SIZE) / 2;
/** Where a block enters from, in points — the phase stamp's rise, in reverse. */
const ENTER_RISE = 8;
/** Squeezed in from a hair narrow, so a line reads as arriving rather than appearing. */
const ENTER_SCALE_X = 0.94;

export function LetterTile({
  tile,
  size,
  dimmed = false,
  dealDelayMs = 0,
}: {
  tile: LetterTileData;
  size: number;
  dimmed?: boolean;
  /** The beat this tile waits for before it deals, from the row it sits in. */
  dealDelayMs?: number;
}) {
  return (
    <Tile
      animation="deal"
      dealDelayMs={dealDelayMs}
      dimmed={dimmed}
      ownership="neutral"
      side="front"
      size={size >= 40 ? "medium" : "small"}
      tile={tile}
    />
  );
}

export function EmptyTile({ size }: { size: number }) {
  return <View style={[styles.emptyTile, { width: size, height: size * 1.18 }]} />;
}

/** The flop turns three tiles together; every street after it turns one. */
const FLOP_TILES = 3;

/**
 * The beat a community slot deals on: the slot's place in its own batch. The engine turns the
 * flop's three at once and one tile on each later street, so a slot's beat is its index inside
 * that batch and nothing else — and, read off the slot rather than remembered per render, it is
 * the same on every later render, so a later street deals its own tile and never an earlier one.
 *
 * The batch is derived from the deal's shape (`revealed` is 0, 3, 4 or 5) rather than from how
 * many slots happen to be filled: every slot a batch fills has all the slots before it filled
 * too, so a count of them would read 0 for all three of the flop's tiles.
 */
function communityDealDelayMs(index: number): number {
  return (index < FLOP_TILES ? index : 0) * duration.tileStagger;
}

export function CommunityStrip({ tiles }: { tiles: readonly (LetterTileData | null)[] }) {
  const five = Array.from({ length: 5 }, (_, index) => tiles[index] ?? null);
  return (
    <View style={styles.community}>
      <Text style={styles.communityLabel}>
        COMMUNITY {"\u00B7"} {five.filter(Boolean).length}/5
      </Text>
      <View style={styles.tileRow}>
        {five.map((tile, index) =>
          tile ? (
            <LetterTile
              dealDelayMs={communityDealDelayMs(index)}
              key={`community-${index}`}
              size={42}
              tile={tile}
            />
          ) : (
            <EmptyTile key={`community-${index}`} size={42} />
          ),
        )}
      </View>
    </View>
  );
}

export function PlayerRack({
  privateTiles,
  community,
}: {
  privateTiles: readonly LetterTileData[];
  community: readonly (LetterTileData | null)[];
}) {
  return (
    <View accessibilityLabel="Your letter rack" style={styles.rack}>
      {privateTiles.map((tile, index) => (
        <LetterTile
          dealDelayMs={index * duration.holeStagger}
          key={tile.id}
          size={36}
          tile={tile}
        />
      ))}
      {Array.from({ length: 5 }, (_, index) => community[index] ?? null).map(
        (tile, index) =>
          tile ? (
            <LetterTile
              dealDelayMs={communityDealDelayMs(index)}
              dimmed
              key={`rack-${index}`}
              size={36}
              tile={tile}
            />
          ) : (
            <EmptyTile key={`rack-empty-${index}`} size={36} />
          ),
      )}
    </View>
  );
}

export function PlayerSeat({ seat, anchor }: SeatSlot<GamePlayer>) {
  if (!seat) {
    return (
      <View style={styles.seat}>
        <View style={[styles.avatar, styles.emptyAvatar]} />
        <Text style={styles.emptySeatLabel}>OPEN</Text>
      </View>
    );
  }
  const active = seat.status === "your-turn";
  const winner = seat.status === "winner";
  const lit = active || winner;
  const statusColor = winner ? colors.goldHi : active ? colors.gold : colors.success;
  // A busted seat is dimmed like a folded one: it is at the table, and it is not playing.
  const out = seat.status === "fold" || seat.status === "busted";
  const betStyle =
    Math.abs(anchor.x - 0.5) > Math.abs(anchor.y - 0.5)
      ? { left: anchor.x < 0.5 ? 72 : -3, top: 22 }
      : { left: 34, top: anchor.y < 0.5 ? 45 : -13 };
  return (
    <View style={[styles.seat, out && styles.folded]}>
      <View style={styles.avatarWrap}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: seat.color },
            lit && { borderColor: statusColor, borderWidth: 3 },
            winner && glow(colors.goldHi, 16),
          ]}>
          <Text style={styles.initials}>{seat.initials}</Text>
        </View>
        {seat.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{ROLE_LABEL[seat.role]}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.playerName}>
        {seat.name.toUpperCase()}
        {seat.isHero ? <Text style={styles.youLabel}> {"\u00B7"} YOU</Text> : null}
      </Text>
      <View
        style={[
          styles.statusPill,
          lit && { backgroundColor: statusColor, borderColor: statusColor },
        ]}>
        <Text style={[styles.statusText, lit && styles.statusTextLit]}>
          {STATUS_LABEL[seat.status]}
        </Text>
      </View>
      <Text style={styles.stack}>{`$${seat.stack.toLocaleString()}`}</Text>
      {seat.bet ? (
        <View style={[styles.betChip, betStyle]}>
          <Text style={styles.betChipText}>{seat.bet}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The chips in the middle. A hand whose all-ins differ splits them into layers (§25); the
 * main pot is the headline and every side pot is a line under it, because each is contested
 * by a different set of seats and a single merged total would claim otherwise.
 */
export function Pot({ amount, sidePots = [] }: { amount: number; sidePots?: readonly number[] }) {
  return (
    <View style={styles.pot} testID="pot">
      <Text style={styles.potLabel}>POT</Text>
      <Text style={styles.potAmount}>{`$${amount.toLocaleString()}`}</Text>
      {sidePots.map((side, index) => (
        <Text
          key={`side-pot-${index}`}
          style={styles.sidePotAmount}
          testID={`side-pot-${index}`}
        >
          {`SIDE POT $${side.toLocaleString()}`}
        </Text>
      ))}
    </View>
  );
}

export function BestWord({
  word,
  score,
  payout,
}: {
  word?: string;
  score?: number;
  payout: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // 1 is at rest: the block is legible on its first frame, and a renderer that never runs
  // an animation simply leaves it there.
  const rise = useSharedValue(1);
  const fade = useSharedValue(1);

  // Restarted by the word it announces, never by a mount: a pot change, a seat change or
  // a phase the table has nothing new to say about does not move this block.
  useEffect(() => {
    cancelAnimation(rise);
    cancelAnimation(fade);
    if (reduceMotion) {
      rise.set(1);
      fade.set(1);
      return;
    }
    rise.set(0);
    fade.set(0);
    rise.set(withSpring(1, motionEasing.springOvershoot));
    fade.set(withTiming(1, { duration: duration.phaseIn }));
  }, [word, payout, reduceMotion, rise, fade]);

  const entrance = useAnimatedStyle(() => ({
    opacity: interpolate(fade.get(), [0, 1], [0, 1]),
    transform: [
      { translateY: interpolate(rise.get(), [0, 1], [ENTER_RISE, 0]) },
      { scaleX: interpolate(rise.get(), [0, 1], [ENTER_SCALE_X, 1]) },
    ],
  }));

  // The block is the table's answer, not a placeholder: while the hand is being played and
  // there is no word yet, the spot above the rack belongs to the seat's own line — the word
  // builder draws its draft there — and a heading over an em dash is not information.
  if (!payout && word === undefined) return null;

  return (
    <Animated.View style={[styles.bestWord, entrance]}>
      <Text style={styles.bestWordLabel}>
        {payout ? "WINNING WORD" : "BEST WORD SO FAR"}
      </Text>
      <Text style={[styles.bestWordValue, payout && styles.winningWord]}>
        {word ?? "\u2014"}
        {score ? (
          <Text style={styles.bestWordScore}> {"\u00B7"} {score}pts</Text>
        ) : null}
      </Text>
    </Animated.View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled,
  danger,
  gold,
  wide,
  compact,
  testID,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  gold?: boolean;
  wide?: boolean;
  /** Hugs its label instead of sharing the row: for a control beside full-width actions. */
  compact?: boolean;
  testID?: string;
}) {
  const content = <Text style={[styles.actionText, gold && styles.goldActionText]}>{label}</Text>;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        wide && styles.wideAction,
        compact && styles.compactAction,
        danger && styles.dangerAction,
        gold && styles.goldAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      testID={testID}>
      {gold ? (
        <LinearGradient {...gradients.goldButton} style={styles.actionGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  community: {
    alignItems: "center",
    borderBottomColor: "rgba(212,175,55,0.15)",
    borderBottomWidth: border.hairline,
    paddingBottom: 10,
    paddingTop: 10,
  },
  communityLabel: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  tileRow: { flexDirection: "row", gap: 6 },
  tile: {
    alignItems: "center",
    borderColor: "rgba(120,80,20,0.25)",
    borderRadius: 6,
    borderWidth: border.hairline,
    justifyContent: "center",
    ...elevation.tile,
  },
  letter: { color: colors.onTile, fontFamily: fonts.sansBlack, letterSpacing: -0.5 },
  points: {
    bottom: 2,
    color: "#7a4a10",
    fontFamily: fonts.sansBlack,
    position: "absolute",
    right: 4,
  },
  multiplier: {
    color: "#c79a1e",
    fontFamily: fonts.sansBlack,
    left: 3,
    position: "absolute",
    top: 1,
  },
  emptyTile: {
    backgroundColor: "rgba(0,0,0,0.18)",
    borderColor: "rgba(212,175,55,0.22)",
    borderRadius: 6,
    borderStyle: "dashed",
    borderWidth: 1.5,
  },
  rack: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingBottom: 7,
    paddingTop: 4,
  },
  seat: {
    alignItems: "center",
    height: SEAT_STACK_HEIGHT,
    position: "relative",
    transform: [{ translateY: SEAT_AVATAR_ANCHOR_OFFSET }],
    width: 86,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    alignItems: "center",
    borderColor: palette.felt600,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: SEAT_AVATAR_SIZE,
    justifyContent: "center",
    width: SEAT_AVATAR_SIZE,
    ...elevation.card,
  },
  emptyAvatar: {
    backgroundColor: colors.surface,
    borderColor: colors.borderFaint,
    borderStyle: "dashed",
  },
  initials: { color: "#0c1410", fontFamily: fonts.sansBlack, fontSize: 12 },
  roleBadge: {
    alignItems: "center",
    backgroundColor: colors.textBright,
    borderColor: "#3a2815",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 17,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    top: -4,
    width: 17,
    zIndex: 2,
  },
  roleText: { color: colors.onGold, fontFamily: fonts.monoBold, fontSize: 7 },
  playerName: {
    color: colors.textBright,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.8,
    marginTop: 3,
    maxWidth: 86,
  },
  youLabel: { color: colors.gold },
  statusPill: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(158,194,122,0.3)",
    borderRadius: 3,
    borderWidth: border.hairline,
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  statusText: {
    color: palette.green500,
    fontFamily: fonts.monoBold,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  statusTextLit: { color: colors.onGold },
  stack: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 10, marginTop: 2 },
  folded: { opacity: 0.45 },
  emptySeatLabel: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: 7,
    letterSpacing: 1,
    marginTop: 3,
  },
  betChip: {
    alignItems: "center",
    backgroundColor: "#c41a1a",
    borderColor: colors.textBright,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 17,
    justifyContent: "center",
    position: "absolute",
    width: 17,
    ...elevation.tile,
  },
  betChipText: { color: "#fff8dc", fontFamily: fonts.sansBlack, fontSize: 6 },
  pot: { alignItems: "center" },
  potLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  potAmount: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 26, lineHeight: 30 },
  sidePotAmount: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  bestWord: { alignItems: "center", paddingBottom: 3, paddingTop: 7 },
  bestWordLabel: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  bestWordValue: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: 20,
    fontStyle: "italic",
    lineHeight: 25,
  },
  winningWord: { color: colors.goldHi },
  bestWordScore: { color: colors.gold, fontSize: 13, fontStyle: "normal" },
  action: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 8,
    borderWidth: border.hairline,
    flex: 1,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
  },
  wideAction: { flex: 1.35 },
  compactAction: { flex: 0, paddingHorizontal: 10 },
  dangerAction: { borderColor: "rgba(255,93,78,0.4)" },
  goldAction: { borderColor: colors.goldDeep },
  actionGradient: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  actionText: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  goldActionText: { color: colors.onGold },
  disabled: { opacity: opacity.disabled },
  pressed: { opacity: opacity.pressed },
});
