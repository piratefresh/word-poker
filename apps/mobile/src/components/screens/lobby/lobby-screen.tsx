/**
 * lobby-screen.tsx — The Parlor: the tables open right now, and the way to deal one.
 *
 * The list is the subscription's own (`useLobby`), so a table that fills up or closes is a card
 * that updates or leaves rather than a screen that goes stale. §3's browser is drawn as the design
 * has it: the liveliest table takes the hero card with the felt and the one gold way in, the rest
 * follow as rows, and the rail above them counts the room. Which table is the hero, what its
 * button says and what the rail reads are `parlor-view.ts`'s three folds over the listing — this
 * screen is the drawing, and it holds no rules of its own.
 *
 * A tap takes a seat and then shows it. The seat already held is the one exception: a room counts
 * connections, not identities, so asking to join the table you are sitting at would take a second
 * seat rather than return to the first — that card routes to the seat instead of joining it.
 *
 * A refusal never leaves the card hanging on "taking your seat": the sentence goes up over the
 * buttons, the list is asked for again (a seat taken under us is what usually says no), and the
 * cards come back.
 *
 * Tables nobody can sit at — full under §5's cap, locked for §3's "temporarily unavailable" — stay
 * listed and visibly inert: a player watching a table fill is watching the room they were about to
 * take.
 */

import { router } from "expo-router";
import { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RoomSummary } from "@wordpoker/contracts";

import { GoldButton } from "@/components/ui/gold-button";
import {
  border,
  colors,
  fonts,
  fontSize,
  radius,
  spacing,
} from "@/constants/theme";
import { authClient } from "@/lib/auth-client";
import { joinTable, useActiveRoomId } from "@/lib/room-session";
import { useLobby } from "@/lib/use-lobby";
import { CreateTableForm } from "./create-table-form";
import { FeaturedTableCard } from "./featured-table";
import { ParlorBackground } from "./parlor-background";
import { ParlorNav } from "./parlor-nav";
import { ParlorStats } from "./parlor-stats";
import { parlorView } from "./parlor-view";
import { RoomRow } from "./room-row";

/** How much room the floating "deal" button and its shadow need under the last row. */
const CTA_CLEARANCE = 96;

export function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { status, rooms, refreshing, error, refresh } = useLobby();
  const activeRoomId = useActiveRoomId();
  const { data: session } = authClient.useSession();
  const [joining, setJoining] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { featured, others, stats } = parlorView(rooms, activeRoomId);
  const joiningRoom =
    joining === null
      ? undefined
      : rooms.find((room) => room.roomId === joining);

  // One line over the buttons: the refusal if the last tap was refused, otherwise the seat it is
  // still taking. A refusal is never shown beside "taking your seat", because it *is* the outcome.
  const banner =
    refusal ??
    (joiningRoom === undefined
      ? null
      : `Taking a seat at ${joiningRoom.metadata.name}…`);

  const openTable = (room: RoomSummary) => {
    const { roomId } = room;

    if (roomId === activeRoomId) {
      // The seat is already this device's: a second `joinById` would take a second seat (§3), so
      // the card is the way back to the table rather than a way into it.
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
        setRefusal(
          failure instanceof Error
            ? failure.message
            : "That table could not be joined.",
        );
        // The list is the table's own account of itself: a seat taken under us is what says no,
        // so what the screen holds is asked for again before the player tries the next card.
        refresh();
      })
      .finally(() => setJoining(null));
  };

  // The route draws no header, so the room reaches under the status bar and past the home
  // indicator on its own. A tap on the chevron leaves the way it arrived — and a link that opened
  // the lobby cold has nowhere to leave to, so that one goes to the menu it would have come from.
  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  return (
    <View style={styles.screen} testID="lobby-screen">
      <ParlorBackground />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + CTA_CLEARANCE,
          paddingTop: insets.top + spacing.md,
        }}
        refreshControl={
          <RefreshControl
            colors={[colors.gold]}
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={colors.gold}
          />
        }
        testID="lobby-scroll"
      >
        <ParlorNav
          me={session?.user.name?.trim() || session?.user.email}
          onBack={back}
        />

        <ParlorStats stats={stats} />

        {featured === null ? null : (
          <FeaturedTableCard
            featured={featured}
            joining={joining === featured.room.roomId}
            onJoin={() => openTable(featured.room)}
          />
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other tables</Text>

          {others.map((room) => (
            <RoomRow
              disabled={joining !== null}
              key={room.roomId}
              onPress={() => openTable(room)}
              room={room}
              yours={room.roomId === activeRoomId}
            />
          ))}

          {status === "loading" && rooms.length === 0 ? (
            <Text style={styles.note} testID="lobby-loading">
              Looking for tables…
            </Text>
          ) : null}

          {status === "ready" && rooms.length === 0 ? (
            <Text style={styles.note} testID="lobby-empty">
              The room is empty — deal the first table.
            </Text>
          ) : null}

          {status === "ready" && rooms.length > 0 && others.length === 0 ? (
            <Text style={styles.note} testID="lobby-only-table">
              This is the only table in the room.
            </Text>
          ) : null}

          {status === "error" ? (
            <View style={styles.dropped}>
              <Text style={styles.refusal} testID="lobby-error">
                {error}
              </Text>
              <GoldButton
                label="TRY THE LIST AGAIN"
                onPress={refresh}
                testID="lobby-retry"
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* What the last tap is doing, or what it was told — over the felt, never under the fold.
          A refusal is the outcome of the join above it, so it takes the slot the moment it lands. */}
      {banner === null ? null : (
        <Text
          style={[
            styles.banner,
            joiningRoom === undefined
              ? styles.bannerRefusal
              : styles.bannerNotice,
            { bottom: insets.bottom + CTA_CLEARANCE },
          ]}
          testID={joiningRoom === undefined ? "lobby-refusal" : "lobby-joining"}
        >
          {banner}
        </Text>
      )}

      <GoldButton
        icon="plus"
        label="DEAL A NEW TABLE"
        onPress={() => setCreating(true)}
        style={[styles.floating, { bottom: insets.bottom + spacing.md }]}
        testID="lobby-create"
      />

      <CreateTableForm visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  section: {
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.textBright,
    fontFamily: fonts.serifBoldItalic,
    fontSize: fontSize.title,
  },
  note: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    lineHeight: 22,
  },
  dropped: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  refusal: {
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  banner: {
    backgroundColor: colors.scrim,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    left: spacing.gutter,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: "absolute",
    right: spacing.gutter,
    textAlign: "center",
  },
  bannerNotice: {
    color: colors.goldHi,
  },
  bannerRefusal: {
    color: colors.danger,
  },
  floating: {
    left: spacing.gutter,
    position: "absolute",
    right: spacing.gutter,
  },
});
