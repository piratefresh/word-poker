/**
 * room-row.tsx — one table as §3's browser lists it: its name, its fixed buy-in, the blinds that
 * buy-in derives, the seats taken of the seats it has, and a way in.
 *
 * The card is the screen's primary control, so it is a React Native `Pressable` hosted inside the
 * universal layout (`RNHostView`, the library's own bridge for exactly this). `@expo/ui`'s
 * pressable containers carry a test id but no accessibility label, and a card without one is not a
 * card a screen reader can offer — its skin is the felt's tokens either way.
 *
 * A row nobody can sit at says so and does nothing: full (§5's cap reached), locked (§3's
 * temporarily unavailable), or held by a caller for its own reason, the card dims and takes no
 * press. Full and locked tables are read off the listing itself, so they stay in the list and
 * stay inert rather than vanishing.
 */

import { RNHostView } from "@expo/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tableStatus, type RoomSummary } from "@wordpoker/contracts";

import {
  border,
  colors,
  elevation,
  fonts,
  fontSize,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";
import { formatAmount } from "@/lib/format";

export type RoomRowProps = {
  room: RoomSummary;
  /**
   * This device already holds this table's seat. §3's "already seated" row is the way *back* to
   * the seat rather than a way into it — and it stays that way even when the table is full,
   * because it is full of the player reading it.
   */
  yours?: boolean;
  /** The caller's own reason the row cannot be taken right now — a join already in flight. */
  disabled?: boolean;
  onPress: () => void;
};

/** The blinds as §3's card states them: the two numbers, smallest first. */
function blindsLabel(room: RoomSummary): string {
  return `${formatAmount(room.metadata.smallBlind)} / ${formatAmount(room.metadata.bigBlind)} BLINDS`;
}

/** The table as a sentence, for a screen reader and for Maestro's `id:` matcher. */
function spokenLabel(room: RoomSummary, yours: boolean): string {
  const status = tableStatus(room.metadata) === "waiting" ? "waiting for players" : "a hand in play";
  const table = `${room.metadata.name}, ${formatAmount(room.metadata.buyIn)} buy-in, blinds ${formatAmount(room.metadata.smallBlind)} and ${formatAmount(room.metadata.bigBlind)}, ${room.clients} of ${room.maxClients} seats taken, ${status}`;
  if (yours) return `Your table, ${table}`;
  if (room.clients >= room.maxClients) return `Full table, ${table}`;
  if (room.locked) return `Unavailable table, ${table}`;
  return `Join ${table}`;
}

/** What the card offers: the way back to your own seat, a way in, or why there is none. */
function actionLabel(room: RoomSummary, yours: boolean, taken: boolean): string {
  if (yours) return "YOUR TABLE";
  if (room.clients >= room.maxClients) return "FULL";
  if (room.locked) return "LOCKED";
  return taken ? "PLEASE WAIT" : "JOIN";
}

export function RoomRow({ room, yours = false, disabled = false, onPress }: RoomRowProps) {
  const waiting = tableStatus(room.metadata) === "waiting";
  const taken = yours
    ? disabled
    : disabled || room.locked || room.clients >= room.maxClients;

  return (
    <RNHostView matchContents>
      <Pressable
        accessibilityLabel={spokenLabel(room, yours)}
        accessibilityRole="button"
        disabled={taken}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          yours && styles.yours,
          taken && styles.taken,
          pressed && !taken && styles.pressed,
        ]}
        testID={`lobby-room-${room.roomId}`}
      >
        <View style={styles.headline}>
          <Text numberOfLines={1} style={styles.name}>
            {room.metadata.name}
          </Text>
          <Text style={[styles.status, waiting ? styles.waiting : styles.inHand]}>
            {waiting ? "WAITING" : "IN HAND"}
          </Text>
        </View>

        <View style={styles.stakes}>
          <Text style={styles.buyIn}>{formatAmount(room.metadata.buyIn)}</Text>
          <Text style={styles.seats}>
            {room.clients} / {room.maxClients}
          </Text>
        </View>

        <Text style={styles.blinds} testID={`lobby-room-blinds-${room.roomId}`}>
          {blindsLabel(room)}
        </Text>

        <Text style={[styles.action, yours && styles.actionYours, taken && styles.actionTaken]}>
          {actionLabel(room, yours, taken)}
        </Text>
      </Pressable>
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: "100%",
  },
  taken: {
    opacity: opacity.disabled,
  },
  /** The table this device is sitting at: gold-framed rather than dimmed, and never inert. */
  yours: {
    borderColor: colors.borderStrong,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  headline: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  name: {
    color: colors.textBright,
    flexShrink: 1,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.title,
  },
  status: {
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
    marginLeft: "auto",
  },
  waiting: {
    color: colors.successHi,
  },
  inHand: {
    color: colors.warning,
  },
  stakes: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm,
  },
  buyIn: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.bodyLg,
    letterSpacing: 0.5,
  },
  seats: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.2,
    marginLeft: "auto",
  },
  /** §3's Blinds: the table's two forced bets, under the buy-in it derives them from. */
  blinds: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
  },
  action: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2,
  },
  /** Your own seat reads as a live state, not as an offer. */
  actionYours: {
    color: colors.successHi,
  },
  actionTaken: {
    color: colors.textDim,
  },
});
