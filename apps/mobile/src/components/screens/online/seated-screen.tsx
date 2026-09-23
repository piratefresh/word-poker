import { Button, Column, Host, Row, Spacer, Text, type UniversalTextStyle } from "@expo/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { WAITING_PHASE } from "@wordpoker/contracts";

import {
  border,
  colors,
  elevation,
  fonts,
  fontSize,
  layout,
  radius,
  spacing,
} from "@/constants/theme";
import { formatAmount } from "@/lib/format";
import {
  joinTable,
  leaveTable,
  useActiveRoomId,
  useRoomSession,
  useSeatedRoom,
  type TableSnapshot,
} from "@/lib/room-session";
import { useDictionary } from "@/lib/use-dictionary";

import { OnlineFelt } from "./online-felt";

/** The session always names its failure; these stand in only for the impossible empty one. */
const REFUSAL_FALLBACK = "Couldn't take that seat.";
const LOST_FALLBACK = "You're no longer at that table.";

/** The screen's ink, in the design system's terms — no colour, family or size is literal. */
const kickerText = {
  color: colors.gold,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 2,
} satisfies UniversalTextStyle;

const titleText = {
  color: colors.textBright,
  fontFamily: fonts.serifBold,
  fontSize: fontSize.h2,
} satisfies UniversalTextStyle;

const statusText = {
  color: colors.goldHi,
  fontFamily: fonts.sansBold,
  fontSize: fontSize.small,
  letterSpacing: 1.6,
} satisfies UniversalTextStyle;

const detailText = {
  color: colors.textDim,
  fontFamily: fonts.sans,
  fontSize: fontSize.body,
} satisfies UniversalTextStyle;

const factLabelText = {
  color: colors.textDim,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 1.4,
} satisfies UniversalTextStyle;

const factValueText = {
  color: colors.goldHi,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.bodyLg,
  letterSpacing: 0.5,
} satisfies UniversalTextStyle;

/**
 * The table this device is sitting at — `/online/<roomId>`, reached straight from a create,
 * from a lobby row, or cold from a deep link or a reload.
 *
 * The screen's first job is the seat: the route names one table, and the session holds at most
 * one, so a mount that does not already hold that exact table joins it, and a mount that does
 * joins nothing — a seat is a connection, and a second join would take a second seat rather
 * than return to the first. Every fact the seated face shows is the synced state's own; this
 * screen owns no game logic and no connection of its own.
 *
 * Both failures are states, not crashes: a seat that could not be taken (`error`) and a seat
 * that went away on its own (`lost`) each render the session's own sentence with the way back
 * to the lobby. Leaving is the one control that mutates anything, and it disarms itself on the
 * way in so two taps can never ask the table to leave twice.
 *
 * Epic C replaces this screen's content with the online felt; the route stays.
 */
export function SeatedScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const session = useRoomSession();
  const holdsSeat = useActiveRoomId() === roomId;
  const room = useSeatedRoom(roomId);
  const dictionary = useDictionary();
  const joinedRoom = useRef<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingOnce = useRef(false);

  // Ask for the seat once per room, not once per render. The room is marked as this mount's the
  // moment the effect looks at it, whether or not it had to join: a mount that already held the
  // seat (create, or a row tapped in the lobby) has nothing to take, and the seat it gives up on
  // Leave must not be taken again by this screen on its way out — `holdsSeat` flips false the
  // instant the session publishes the leave, and joining on that flip would put the player back
  // at the table they just left. The refusal is the session's own error state below; this catch
  // only keeps the rejection from going unhandled.
  useEffect(() => {
    if (joinedRoom.current === roomId) return;
    joinedRoom.current = roomId;
    if (holdsSeat) return;
    void joinTable(roomId).catch(() => {});
  }, [holdsSeat, roomId]);

  // One road back for all three ends: a refusal, a lost seat, and a leave. `dismissTo` pops to the
  // lobby this screen was pushed from; `replace` would leave that entry in the stack and mount a
  // second lobby on top of it, and every lobby screen runs its own subscription to the lobby room.
  const toLobby = () => {
    router.dismissTo("/online");
  };

  const leave = () => {
    // Disarm on the way in rather than on the re-render: a second tap in the same frame would
    // otherwise still find the control armed and leave a table it is already leaving.
    if (leavingOnce.current) return;
    leavingOnce.current = true;
    setLeaving(true);
    void leaveTable(roomId).finally(toLobby);
  };

  // A seat held at some other table is not this table's face — the join above is what moves it.
  const table =
    session.status === "seated" && session.roomId === roomId ? session.table : undefined;

  // A hand is live once the table leaves the waiting room; only then does the felt have a hand to
  // draw. The dictionary is loading in parallel (§11 judges the word against it), so a hand that
  // deals before it lands holds on the table's own card until it arrives, then swaps to the felt.
  const liveHand = table !== undefined && table.phase !== WAITING_PHASE;

  const body =
    liveHand && room !== null && dictionary !== null ? (
      <OnlineFelt dictionary={dictionary} onLeave={leave} room={room} />
    ) : table !== undefined ? (
      <TableFace leaving={leaving} onLeave={leave} table={table} />
    ) : session.status === "error" ? (
      <Notice
        message={session.error ?? REFUSAL_FALLBACK}
        onLobby={toLobby}
        testID="seated-error"
      />
    ) : session.status === "lost" ? (
      <Notice message={session.error ?? LOST_FALLBACK} onLobby={toLobby} testID="seated-lost" />
    ) : (
      <Joining />
    );

  return (
    <View accessibilityLabel="Online table" style={styles.screen} testID="seated-screen">
      {body}
    </View>
  );
}

/** The table's own face: the name it was created with, its stakes, its live seats, its phase. */
function TableFace({
  table,
  leaving,
  onLeave,
}: {
  table: TableSnapshot;
  leaving: boolean;
  onLeave: () => void;
}) {
  const waiting = table.phase === WAITING_PHASE;

  return (
    <View
      accessibilityLabel={`${table.name}, ${waiting ? "waiting" : "in hand"}, ${table.seats} of ${table.maxSeats} seats taken`}
      style={styles.card}
      testID="seated-table"
    >
      <Host colorScheme="dark" matchContents seedColor={colors.gold}>
        <Column alignment="start" spacing={spacing.sm}>
          <Text textStyle={kickerText}>ONLINE TABLE</Text>
          <Text testID="seated-name" textStyle={titleText}>
            {table.name}
          </Text>
          <Text testID="seated-status" textStyle={statusText}>
            {waiting ? "WAITING" : "IN HAND"}
          </Text>
          <Text testID="seated-status-detail" textStyle={detailText}>
            {waiting
              ? "The hand deals once enough players have sat down."
              : "Play is under way at this table."}
          </Text>

          <Spacer size={spacing.sm} />
          <Stat label="BUY-IN" testID="seated-buy-in" value={formatAmount(table.buyIn)} />
          <Stat
            label="BLINDS"
            testID="seated-blinds"
            value={`${formatAmount(table.smallBlind)} / ${formatAmount(table.bigBlind)}`}
          />
          <Stat label="SEATS" testID="seated-seats" value={`${table.seats} / ${table.maxSeats}`} />
          <Spacer size={spacing.md} />

          <Button
            disabled={leaving}
            label="Leave table"
            onPress={onLeave}
            testID="seated-leave"
            variant="outlined"
          />
        </Column>
      </Host>
    </View>
  );
}

/** One line of the table's stakes: the game's own word for it, and the state's own number. */
function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <Row alignment="center" spacing={spacing.md} style={styles.stat}>
      <Text textStyle={factLabelText}>{label}</Text>
      <Spacer flexible />
      <Text testID={testID} textStyle={factValueText}>
        {value}
      </Text>
    </Row>
  );
}

/** The seat is being taken: nothing to show and nothing to press until the table answers. */
function Joining() {
  return (
    <View accessibilityLabel="Taking your seat" style={styles.card} testID="seated-joining">
      <Host colorScheme="dark" matchContents seedColor={colors.gold}>
        <Column alignment="start" spacing={spacing.sm}>
          <Text textStyle={kickerText}>ONLINE TABLE</Text>
          <Text testID="seated-joining-title" textStyle={titleText}>
            Taking your seat…
          </Text>
          <Text textStyle={detailText}>Waiting for the table to answer.</Text>
        </Column>
      </Host>
    </View>
  );
}

/** A seat that is not there: the session's sentence, and the lobby it came from. */
function Notice({
  message,
  onLobby,
  testID,
}: {
  message: string;
  onLobby: () => void;
  testID: string;
}) {
  return (
    <View accessibilityLabel={message} style={styles.card} testID={testID}>
      <Host colorScheme="dark" matchContents seedColor={colors.gold}>
        <Column alignment="start" spacing={spacing.sm}>
          <Text textStyle={kickerText}>ONLINE TABLE</Text>
          <Text testID="seated-message" textStyle={titleText}>
            {message}
          </Text>
          <Spacer size={spacing.sm} />
          <Button
            label="Back to lobby"
            onPress={onLobby}
            testID="seated-back-to-lobby"
            variant="outlined"
          />
        </Column>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xxxl,
  },
  card: {
    ...elevation.card,
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: "100%",
  },
  stat: { width: "100%" },
});
