/**
 * room-row.tsx — one of the room's other tables, as §3's browser lists it: its name, its fixed
 * buy-in, the blinds that buy-in derives, the seats taken of the seats it has, and a way in.
 *
 * The card is the screen's primary control, so it is a React Native `Pressable`. Its sentence to a
 * screen reader is unchanged from the browser this screen has always been: the table's name, its
 * fixed buy-in, its players of its cap, its state, and what tapping it would do — which is also
 * what Maestro matches a row by.
 *
 * A row nobody can sit at says so and does nothing: full (§5's cap reached), locked (§3's
 * temporarily unavailable), or held by a caller for its own reason, the card dims and takes no
 * press. Full and locked tables are read off the listing itself, so they stay in the list and stay
 * inert rather than vanishing.
 *
 * The card carries two stamps: the table's own state along the top — §3's waiting / in hand — and
 * §3's offer in the corner under it, in the words this browser has always used (JOIN, YOUR TABLE,
 * FULL, LOCKED). The full sentence, state and all, is on the card for a screen reader, so the two
 * short words never have to carry it alone.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAX_SEATS, tableStatus, type RoomSummary } from "@wordpoker/contracts";

import {
  border,
  colors,
  fonts,
  fontSize,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";
import { formatAmount } from "@/lib/format";
import { spokenTable } from "./parlor-view";

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

/** The state the table is in — §3's waiting / in hand, never a third vocabulary. */
function stateFor(room: RoomSummary): { label: string; open: boolean } {
  const waiting = tableStatus(room.metadata) === "waiting";
  return { label: waiting ? "WAITING" : "IN HAND", open: waiting };
}

/** What the card offers: the way back to your own seat, a way in, or why there is none. */
function offerFor(room: RoomSummary, yours: boolean): string {
  if (yours) return "YOUR TABLE";
  if (room.clients >= room.maxClients) return "FULL";
  if (room.locked) return "LOCKED";
  return "JOIN";
}

export function RoomRow({ room, yours = false, disabled = false, onPress }: RoomRowProps) {
  const taken = yours ? disabled : disabled || room.locked || room.clients >= room.maxClients;
  const state = stateFor(room);
  const offer = offerFor(room, yours);
  const offered = offer === "JOIN";

  // §5 caps a table at six. A listing that claims more than the rules allow draws the most the
  // rules allow — the count beside it is the listing's own and stays exact.
  const pipCount = Math.min(room.maxClients, MAX_SEATS);

  return (
    <Pressable
      accessibilityLabel={spokenTable(room, yours)}
      accessibilityRole="button"
      accessibilityState={{ disabled: taken }}
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
        <View style={styles.state}>
          <View style={[styles.dot, state.open ? styles.dotOpen : styles.dotLive]} />
          <Text style={[styles.stateText, state.open ? styles.open : styles.live]}>
            {state.label}
          </Text>
        </View>
      </View>

      <View style={styles.stakes}>
        <Text style={styles.buyIn}>{formatAmount(room.metadata.buyIn)}</Text>
        <Text style={styles.seats}>
          {room.clients} / {room.maxClients} SEATS
        </Text>
        <View style={styles.pips}>
          {Array.from({ length: pipCount }, (_, index) => (
            <View
              key={index}
              style={[
                styles.pip,
                index < room.clients
                  ? { backgroundColor: colors.players[index % colors.players.length] }
                  : styles.pipOpen,
              ]}
            />
          ))}
        </View>
        <Text style={[styles.offer, offered ? styles.gold : styles.dim]}>{offer}</Text>
      </View>

      <Text style={styles.blinds} testID={`lobby-room-blinds-${room.roomId}`}>
        {blindsLabel(room)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
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
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small + 2,
  },
  state: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginLeft: "auto",
  },
  dot: {
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  dotOpen: {
    backgroundColor: colors.successHi,
  },
  dotLive: {
    backgroundColor: colors.danger,
  },
  stateText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
  },
  gold: {
    color: colors.gold,
  },
  open: {
    color: colors.successHi,
  },
  live: {
    color: colors.danger,
  },
  dim: {
    color: colors.textDim,
  },
  stakes: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  buyIn: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
  },
  seats: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.2,
  },
  pips: {
    flexDirection: "row",
    gap: 3,
    marginLeft: "auto",
  },
  /** §3's Blinds: the table's two forced bets, under the buy-in it derives them from. */
  blinds: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
  },
  pip: {
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  pipOpen: {
    borderColor: colors.borderStrong,
    borderWidth: border.hairline,
  },
  /** §3's join, in the card's own corner: the word is the affordance the card cannot draw one for. */
  offer: {
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: 1.6,
  },
});
