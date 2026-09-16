import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Tile } from "@/components/game";
import type { SeatSlot } from "@/components/table";
import {
  border,
  colors,
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
  winner: "WINNER",
};
const ROLE_LABEL: Record<PlayerRole, string> = {
  dealer: "D",
  "small-blind": "SB",
  "big-blind": "BB",
};

const SEAT_STACK_HEIGHT = 92;
const SEAT_AVATAR_SIZE = 38;
const SEAT_AVATAR_ANCHOR_OFFSET =
  (SEAT_STACK_HEIGHT - SEAT_AVATAR_SIZE) / 2;

export function LetterTile({
  tile,
  size,
  dimmed = false,
}: {
  tile: LetterTileData;
  size: number;
  dimmed?: boolean;
}) {
  return (
    <Tile
      animation="none"
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
            <LetterTile key={tile.id} tile={tile} size={42} />
          ) : (
            <EmptyTile key={`community-empty-${index}`} size={42} />
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
      {privateTiles.map((tile) => (
        <LetterTile key={tile.id} tile={tile} size={36} />
      ))}
      {Array.from({ length: 5 }, (_, index) => community[index] ?? null).map(
        (tile, index) =>
          tile ? (
            <LetterTile key={`rack-${tile.id}`} tile={tile} size={36} dimmed />
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
  const betStyle =
    Math.abs(anchor.x - 0.5) > Math.abs(anchor.y - 0.5)
      ? { left: anchor.x < 0.5 ? 72 : -3, top: 22 }
      : { left: 34, top: anchor.y < 0.5 ? 45 : -13 };
  return (
    <View style={[styles.seat, seat.status === "fold" && styles.folded]}>
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
          <View
            style={[
              styles.roleBadge,
              seat.role === "small-blind" && styles.smallBlind,
              seat.role === "big-blind" && styles.bigBlind,
            ]}>
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

export function Pot({ amount }: { amount: number }) {
  return (
    <View style={styles.pot}>
      <Text style={styles.potLabel}>POT</Text>
      <Text style={styles.potAmount}>{`$${amount.toLocaleString()}`}</Text>
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
  return (
    <View style={styles.bestWord}>
      <Text style={styles.bestWordLabel}>
        {payout ? "WINNING WORD" : "BEST WORD SO FAR"}
      </Text>
      <Text style={[styles.bestWordValue, payout && styles.winningWord]}>
        {word ?? "\u2014"}
        {score ? (
          <Text style={styles.bestWordScore}> {"\u00B7"} {score}pts</Text>
        ) : null}
      </Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled,
  danger,
  gold,
  wide,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  gold?: boolean;
  wide?: boolean;
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
        danger && styles.dangerAction,
        gold && styles.goldAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
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

export function ChatGlyph({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.chatGlyph, small && styles.chatGlyphSmall]}>
      <View style={[styles.chatTail, small && styles.chatTailSmall]} />
    </View>
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
  smallBlind: { backgroundColor: colors.gold, width: 19 },
  bigBlind: { backgroundColor: "#e07a5f", width: 19 },
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
  chatGlyph: {
    borderColor: colors.onGold,
    borderRadius: 4,
    borderWidth: 1.6,
    height: 16,
    width: 20,
  },
  chatGlyphSmall: { borderColor: colors.gold, height: 11, width: 14 },
  chatTail: {
    backgroundColor: colors.gold,
    borderBottomColor: colors.onGold,
    borderBottomWidth: 1.5,
    borderLeftColor: colors.onGold,
    borderLeftWidth: 1.5,
    bottom: -4,
    height: 6,
    left: 4,
    position: "absolute",
    transform: [{ rotate: "-35deg" }],
    width: 6,
  },
  chatTailSmall: {
    backgroundColor: palette.felt600,
    borderBottomColor: colors.gold,
    borderLeftColor: colors.gold,
    bottom: -3,
    height: 4,
    left: 3,
    width: 4,
  },
});
