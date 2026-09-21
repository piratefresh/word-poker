/**
 * lobby-screen.tsx — §3's browser: the tables open right now, and the way to open one.
 *
 * The list is the subscription's own (`useLobby`), so a table that fills up or closes is a row
 * that updates or leaves rather than a screen that goes stale. Tables nobody can sit at — full
 * under §5's cap, locked for §3's "temporarily unavailable" — stay listed and visibly inert: a
 * player watching a table fill is watching the room they were about to take.
 *
 * A tap takes a seat and then shows it. The seat already held is the one exception: a room counts
 * connections, not identities, so asking to join the table you are sitting at would take a second
 * seat rather than return to the first — that row routes to the seat instead of joining it.
 *
 * A refusal never leaves the row hanging on "connecting": the sentence goes up in the list, the
 * list is asked for again (a seat taken under us is what usually says no), and the rows come back.
 */

import { Button, Column, Host, ScrollView, Text, type UniversalTextStyle } from "@expo/ui";
import { router } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RoomSummary } from "@wordpoker/contracts";

import { CreateTableForm } from "@/components/screens/lobby/create-table-form";
import { RoomRow } from "@/components/screens/lobby/room-row";
import { colors, fonts, fontSize, spacing } from "@/constants/theme";
import { joinTable, useActiveRoomId } from "@/lib/room-session";
import { useLobby } from "@/lib/use-lobby";

const titleText = {
  color: colors.textBright,
  fontFamily: fonts.serifBold,
  fontSize: fontSize.h2,
  lineHeight: 34,
} satisfies UniversalTextStyle;

const kickerText = {
  color: colors.gold,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 2,
} satisfies UniversalTextStyle;

const mutedText = {
  color: colors.textDim,
  fontFamily: fonts.sans,
  fontSize: fontSize.body,
  lineHeight: 22,
} satisfies UniversalTextStyle;

const refusalText = {
  color: colors.danger,
  fontFamily: fonts.sans,
  fontSize: fontSize.small,
  lineHeight: 19,
} satisfies UniversalTextStyle;

const noticeText = {
  color: colors.goldHi,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 1.4,
} satisfies UniversalTextStyle;

export function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { status, rooms, error, refresh } = useLobby();
  const activeRoomId = useActiveRoomId();
  const [joining, setJoining] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const openTable = (room: RoomSummary) => {
    const { roomId } = room;

    if (roomId === activeRoomId) {
      // The seat is already this device's: a second `joinById` would take a second seat (§3), so
      // the row is the way back to the table rather than a way into it.
      router.push({ pathname: "/online/[roomId]", params: { roomId } });
      return;
    }

    setRefusal(null);
    setJoining(roomId);
    void joinTable(roomId)
      .then(() => {
        router.push({ pathname: "/online/[roomId]", params: { roomId } });
      })
      .catch((failure: unknown) => {
        // The sentence is the session's own read of the refusal: a table that filled or closed
        // between the listing and the tap says so in the player's words, not a matchmaking code.
        setRefusal(failure instanceof Error ? failure.message : "That table could not be joined.");
        // The list is the table's own account of itself: a seat taken under us is what says no,
        // so what the screen holds is asked for again before the player tries the next row.
        refresh();
      })
      .finally(() => setJoining(null));
  };

  const joiningRoom = joining === null ? undefined : rooms.find((room) => room.roomId === joining);

  // The route draws no header, so the felt reaches under the status bar and past the home
  // indicator on its own.
  const frame = {
    ...styles.screen,
    paddingBottom: insets.bottom + spacing.xxxl,
    paddingTop: insets.top + spacing.xxl,
  };

  return (
    <Host colorScheme="dark" seedColor={colors.gold} style={styles.host} testID="lobby-screen">
      <ScrollView>
        <Column alignment="start" spacing={spacing.md} style={frame}>
          <Text textStyle={titleText}>Open tables</Text>
          <Text textStyle={kickerText}>TAP A TABLE TO TAKE A SEAT</Text>

          <Button
            label="Create a table"
            onPress={() => setCreating(true)}
            testID="lobby-create"
          />

          {joiningRoom === undefined ? null : (
            <Text testID="lobby-joining" textStyle={noticeText}>
              {`Taking a seat at ${joiningRoom.metadata.name}…`}
            </Text>
          )}

          {refusal === null ? null : (
            <Text testID="lobby-refusal" textStyle={refusalText}>
              {refusal}
            </Text>
          )}

          {status === "error" ? (
            <Column alignment="start" spacing={spacing.sm}>
              <Text testID="lobby-error" textStyle={refusalText}>
                {error}
              </Text>
              <Button
                label="Try the list again"
                onPress={refresh}
                testID="lobby-retry"
                variant="outlined"
              />
            </Column>
          ) : null}

          {status === "loading" && rooms.length === 0 ? (
            <Text testID="lobby-loading" textStyle={mutedText}>
              Looking for tables…
            </Text>
          ) : null}

          {/* §3: full and locked tables are listed, not hidden — the rows carry why. */}
          {rooms.map((room) => (
            <RoomRow
              disabled={joining !== null}
              key={room.roomId}
              onPress={() => openTable(room)}
              room={room}
              yours={room.roomId === activeRoomId}
            />
          ))}

          {status === "ready" && rooms.length === 0 ? (
            <Text testID="lobby-empty" textStyle={mutedText}>
              No tables open — create one.
            </Text>
          ) : null}
        </Column>
      </ScrollView>

      <CreateTableForm visible={creating} onClose={() => setCreating(false)} />
    </Host>
  );
}

const styles = {
  host: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.gutter,
    width: "100%" as const,
  },
};
