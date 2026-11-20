import {
  Button,
  Column,
  Host,
  Row,
  Spacer,
  Text,
  type UniversalTextStyle,
} from "@expo/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABLE_STARTED_MESSAGE, WAITING_PHASE } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";

import { Tile } from "@/components/game/word-tile";
import { GameButton } from "@/components/ui/game-button";
import { LoaderOverlay, type LoaderStep } from "@/components/ui/loader-overlay";

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
import { formatAmount } from "@/lib/ui/format";
import { DEAL_MODE_NAMES, powersLabel } from "@/features/table/power-view";
import {
  joinTable,
  leaveTable,
  useActiveRoomId,
  useRoomSession,
  useSeatedRoom,
  type TableSnapshot,
} from "@/features/online/room-session";
import {
  SEAT_LOST,
  SEATED_ELSEWHERE,
  SIGN_IN_REQUIRED,
  TABLE_GONE,
  TABLE_UNREACHABLE,
} from "@/features/online/join-refusals";
import { useDictionary } from "@/features/table/use-dictionary";
import { fullWidth } from "@/lib/ui/full-width";
import { fetchWallet } from "@/lib/wallet/wallet-client";

import { OnlineFelt } from "./online-felt";

/** The session always names its failure; this stands in only for the impossible empty one. */
const REFUSAL_FALLBACK = "Couldn't take that seat.";
/** How long Leave waits on the Wallet read the lobby's coins-back counts from. */
const BALANCE_READ_MS = 1000;

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

  // A join that hangs is the player's to abandon. Giving the room up first means the seat, if it
  // lands after all, is handed straight back rather than left at a table nobody is driving.
  const cancelJoin = () => {
    void leaveTable(roomId).catch(() => {});
    toLobby();
  };

  // "Couldn't reach" is the one refusal worth asking again: the table may well still be there.
  const retry = () => {
    void joinTable(roomId).catch(() => {});
  };

  const leave = () => {
    // Disarm on the way in rather than on the re-render: a second tap in the same frame would
    // otherwise still find the control armed and leave a table it is already leaving.
    if (leavingOnce.current) return;
    leavingOnce.current = true;
    setLeaving(true);
    const name = table?.name;
    // The cash-out is credited after the seat is gone, so the lobby counts the coins back from
    // the balance read here (STO-954). A slow read is given up on rather than holding the leave.
    void Promise.race([
      fetchWallet().then((wallet) => wallet.coins, () => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), BALANCE_READ_MS)),
    ]).then((before) =>
      leaveTable(roomId).finally(() =>
        router.dismissTo(
          before === null || name === undefined
            ? "/online"
            : { pathname: "/online", params: { left: name, before: String(before) } },
        ),
      ),
    );
  };

  // A seat held at some other table is not this table's face — the join above is what moves it.
  const table =
    session.status === "seated" && session.roomId === roomId
      ? session.table
      : undefined;

  // The felt is the table from the moment the seat is taken: it draws the waiting room (the seats,
  // and the ready toggle where the betting row will be) as well as the hand. The dictionary is
  // loading in parallel (§11 judges the word against it), so until it lands the table shows its
  // own card, then swaps to the felt.
  const felt = table !== undefined && room !== null && dictionary !== null;
  const body = felt ? (
    <OnlineFelt dictionary={dictionary} onLeave={leave} room={room} roomId={roomId} />
  ) : table !== undefined ? (
    <TableFace leaving={leaving} onLeave={leave} table={table} />
  ) : session.status === "error" ? (
    <Notice
      copy={noticeFor(session.error ?? REFUSAL_FALLBACK)}
      onLobby={toLobby}
      onRetry={retry}
      testID="seated-error"
    />
  ) : session.status === "lost" ? (
    <Notice
      copy={noticeFor(session.error ?? SEAT_LOST)}
      onLobby={toLobby}
      onRetry={retry}
      testID="seated-lost"
    />
  ) : (
    <LoaderOverlay onLeave={cancelJoin} steps={JOINING} testID="seated-joining">
      <LobbyPill onPress={cancelJoin} />
    </LoaderOverlay>
  );

  return (
    <View
      accessibilityLabel="Online table"
      // Only the table's card sits in the padded column; the felt and the notices fill the screen.
      style={table === undefined || felt ? styles.feltScreen : styles.screen}
      testID="seated-screen"
    >
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
  const powers = powersLabel(table.powerUps);

  return (
    <View
      accessibilityLabel={`${table.name}, ${waiting ? "waiting" : "in hand"}, ${powers === null ? "" : `${powers}, `}${table.seats} of ${table.maxSeats} seats taken`}
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
          <Stat
            label="POWER-UPS"
            testID="seated-powers"
            value={DEAL_MODE_NAMES[table.powerUps.deal]}
          />
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
function Stat({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) {
  return (
    <Row alignment="center" spacing={spacing.md} {...fullWidth()}>
      <Text textStyle={factLabelText}>{label}</Text>
      <Spacer flexible />
      <Text testID={testID} textStyle={factValueText}>
        {value}
      </Text>
    </Row>
  );
}

/** What a notice says: four tiles that spell it, a headline, and the sentence under it. */
interface NoticeCopy {
  word: string;
  title: string;
  body: string;
  /** The table may still be there, so the notice offers to ask again before going back. */
  retry?: boolean;
}

/** The seat is being taken. The lobby pill is there from the start; past the slow mark the loader spells it out. */
const JOINING: readonly LoaderStep[] = [
  { atMs: 0, message: "Connecting", detail: "Reaching the club" },
  { atMs: 1500, message: "Taking your seat", detail: "Waiting for the table to answer" },
];

/**
 * The session's sentence, as a notice. The refusals a player meets most get a headline and a
 * tile word of their own; any other sentence (a Wallet refusal, a create's validator) is shown
 * as it is under a plain headline.
 */
export function noticeFor(message: string): NoticeCopy {
  switch (message) {
    case TABLE_GONE:
      return {
        word: "FULL",
        title: "That table filled up",
        body: "Someone took the last seat, or it closed while you were on your way.",
      };
    case TABLE_STARTED_MESSAGE:
      return {
        word: "LIVE",
        title: "Already dealing",
        body: "That table started without you. Pick another, or deal your own.",
      };
    case SEATED_ELSEWHERE:
      return {
        word: "BUSY",
        title: "You’re at another table",
        body: "Leave your other table or browser tab first. If it dropped, wait for that seat to expire.",
      };
    case SEAT_LOST:
      return { word: "GONE", title: "Your seat is gone", body: message };
    case TABLE_UNREACHABLE:
      return {
        word: "LOST",
        title: "Couldn’t reach the table",
        body: "Check your connection and try again.",
        retry: true,
      };
    case SIGN_IN_REQUIRED:
      return { word: "SIGN", title: "Sign in to play online", body: "Online tables need a signed-in account." };
    default:
      return { word: "NOPE", title: "No seat this time", body: message };
  }
}

/** The tiles' resting tilt, so a refusal lands on the cloth a little askew. */
const TILT_DEG = [-4, 2, -1.5, 5] as const;
const TILE_STAGGER_MS = 70;

/** A seat that is not there at all: the whole felt, the tiles spelling it, and the way back to the lobby at the thumb. */
function Notice({
  copy,
  onLobby,
  onRetry,
  testID,
}: {
  copy: NoticeCopy;
  onLobby: () => void;
  onRetry?: () => void;
  testID: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.notice,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
      ]}
      testID={testID}
    >
      <LobbyPill onPress={onLobby} />

      <View accessibilityLiveRegion="polite" style={styles.noticeBody}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.tiles}
        >
          {[...copy.word].map((letter, index) => (
            <View key={`${copy.word}-${index}`} style={{ transform: [{ rotate: `${TILT_DEG[index] ?? 0}deg` }] }}>
              <Tile
                animation="deal"
                dealDelayMs={index * TILE_STAGGER_MS}
                ownership="neutral"
                side="front"
                size="large"
                tile={{ id: `notice-${index}`, letter, points: LETTER_VALUES[letter as Letter] ?? 0 }}
              />
            </View>
          ))}
        </View>
        <NativeText style={styles.noticeKicker}>ONLINE TABLE</NativeText>
        <NativeText accessibilityRole="header" style={styles.noticeTitle} testID={`${testID}-title`}>
          {copy.title}
        </NativeText>
        <NativeText style={styles.noticeText} testID="seated-message">
          {copy.body}
        </NativeText>
      </View>

      <View style={styles.noticeActions}>
          {copy.retry && onRetry !== undefined ? (
            <GameButton label="Try again" onPress={onRetry} testID="seated-retry" variant="gold" />
          ) : null}
          <GameButton
            label="Back to lobby"
            onPress={onLobby}
            testID="seated-back-to-lobby"
            variant={copy.retry ? "dark" : "gold"}
          />
      </View>
    </View>
  );
}

/** The way back to the lobby, top left, there from the first frame. */
function LobbyPill({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.noticeTop}>
      <Pressable
        accessibilityLabel="Back to lobby"
        accessibilityRole="button"
        hitSlop={spacing.sm}
        onPress={onPress}
        style={({ pressed }) => [styles.lobbyPill, pressed && styles.pressed]}
        testID="seated-lobby-pill"
      >
        <NativeText style={styles.lobbyPillText}>{"‹  Lobby"}</NativeText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The felt lays out its own column (GameScreen caps and centres it); the centred, padded frame is
  // for the table card and the notices only.
  feltScreen: { backgroundColor: colors.bg, flex: 1 },
  notice: {
    flex: 1,
    paddingHorizontal: spacing.gutter,
  },
  /** The lobby pill's row. */
  noticeTop: { flexDirection: "row", minHeight: 40 },
  lobbyPill: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderColor: "rgba(255,232,196,0.45)",
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  lobbyPillText: {
    color: colors.textBright,
    fontFamily: fonts.arcade,
    fontSize: fontSize.body,
    letterSpacing: 0.5,
  },
  pressed: { opacity: 0.7 },
  noticeBody: {
    alignItems: "center",
    alignSelf: "center",
    flex: 1,
    justifyContent: "center",
    maxWidth: layout.maxContentWidth,
    width: "100%",
  },
  tiles: { flexDirection: "row", gap: 6, marginBottom: spacing.xxl },
  noticeKicker: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  noticeTitle: {
    color: colors.textBright,
    fontFamily: fonts.arcade,
    fontSize: 32,
    lineHeight: 35,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  noticeText: {
    color: "rgba(244,228,193,0.8)",
    fontFamily: fonts.sans,
    fontSize: fontSize.bodyLg,
    lineHeight: 23,
    maxWidth: 300,
    textAlign: "center",
  },
  noticeActions: {
    alignSelf: "center",
    gap: spacing.md,
    maxWidth: layout.maxContentWidth,
    width: "100%",
  },
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
});
