/** Details and join action for a room selected from the night lobby. */

import { BottomSheet, RNHostView } from "@expo/ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MAX_SEATS, tableStatus, type RoomSummary } from "@wordpoker/contracts";

import { border, colors, fonts, fontSize, nightLobby, radius, spacing } from "@/constants/theme";
import { formatAmount, formatCoins } from "@/lib/ui/format";
import { openSeats } from "@/features/online/lobby-view";
import { powersLabel } from "@/features/table/power-view";
import { JoinAction } from "./join-action";

export interface RoomDetailsSheetProps {
  room: RoomSummary | null;
  hosted?: boolean;
  yours?: boolean;
  joining?: boolean;
  /** The Wallet's coins; `null` while unread. */
  coins?: number | null;
  guest?: boolean;
  /** The table a full one points to. */
  elsewhere?: RoomSummary | null;
  onClose: () => void;
  onJoin: () => void;
}

export function RoomDetailsSheet({
  room,
  hosted = false,
  yours = false,
  joining = false,
  coins = null,
  guest = false,
  elsewhere = null,
  onClose,
  onJoin,
}: RoomDetailsSheetProps) {
  const players = room?.metadata.players ?? [];
  const seats = Math.min(room?.maxClients ?? 0, MAX_SEATS);

  return (
    <BottomSheet
      containerColor="#0a1028"
      isPresented={room !== null}
      onDismiss={onClose}
      snapPoints={["full"]}
      testID="room-details-sheet"
    >
      {room === null ? null : (
        <RNHostView>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.handle} />
            <View style={styles.top}>
              <Text style={styles.kicker}>TABLE DETAILS</Text>
              <Pressable accessibilityLabel="Close table details" accessibilityRole="button" onPress={onClose} style={styles.close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.name}>{room.metadata.name}</Text>
            <Text style={styles.host}>
              {hosted ? "Your table" : room.metadata.hostName ? `Hosted by ${room.metadata.hostName}` : "Online table"}
              {room.metadata.hostName && !hosted ? ` · ${powersLabel(room.metadata.powerUps) ?? "Classic"}` : ""}
            </Text>

            <View style={styles.facts}>
              <Fact label="BUY-IN" value={`${formatCoins(room.metadata.buyIn)} coins`} />
              <Fact label="OPEN SEATS" value={room.locked ? "Unavailable" : `${openSeats(room)} of ${room.maxClients}`} />
              <Fact label="BLINDS" value={`${formatAmount(room.metadata.smallBlind)} / ${formatAmount(room.metadata.bigBlind)}`} />
              <Fact label="MODE" value={powersLabel(room.metadata.powerUps) ?? "Classic"} />
              <Fact label="STATUS" value={tableStatus(room.metadata) === "waiting" ? "Waiting" : "In hand"} />
            </View>

            <View style={styles.seatSection}>
              <Text style={styles.sectionLabel}>SEATS</Text>
              <View style={styles.seatList}>
                {Array.from({ length: seats }, (_, index) => {
                  const player = players[index];
                  const seated = index < room.clients;
                  return (
                    <View key={player?.id ?? index} style={styles.seatItem}>
                      <View style={[styles.seat, seated ? { backgroundColor: player?.color ?? colors.players[index % colors.players.length] } : styles.seatOpen]}>
                        <Text style={styles.seatInitial}>{seated ? player?.initial ?? "•" : ""}</Text>
                      </View>
                      <Text numberOfLines={1} style={styles.seatName}>
                        {seated ? player ? `Seat ${index + 1} · ${player.initial}` : `Seat ${index + 1}` : `Open ${index + 1}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {room.metadata.lastWord ? (
              <View style={styles.lastWord}>
                <Text style={styles.sectionLabel}>LAST WINNING WORD</Text>
                <View style={styles.lastWordLine}>
                  <Text style={styles.word}>{room.metadata.lastWord.word}</Text>
                  <Text style={styles.points}>+{room.metadata.lastWord.points}</Text>
                </View>
                <Text style={styles.host}>{room.metadata.lastWord.by}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <JoinAction
                context={{ yours, joining, guest, coins }}
                elsewhere={elsewhere}
                onJoin={onJoin}
                room={room}
                surface="sheet"
                testID="room-details-join"
              />
            </View>
          </ScrollView>
        </RNHostView>
      )}
    </BottomSheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl, paddingTop: spacing.md },
  handle: { alignSelf: "center", backgroundColor: "rgba(243,230,196,0.3)", borderRadius: radius.pill, height: 5, marginBottom: spacing.xs, width: 42 },
  top: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 1.8 },
  close: { alignItems: "center", borderColor: "rgba(243,230,196,0.24)", borderRadius: radius.pill, borderWidth: border.thin, height: 34, justifyContent: "center", width: 34 },
  closeText: { color: nightLobby.text.cream, fontFamily: fonts.sans, fontSize: fontSize.h3, lineHeight: 28 },
  name: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h1 },
  host: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.body },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fact: { backgroundColor: "rgba(8,12,28,0.55)", borderColor: nightLobby.border.subtle, borderRadius: radius.md, borderWidth: border.hairline, flexBasis: "47%", flexGrow: 1, gap: spacing.xs, padding: spacing.md },
  sectionLabel: { color: nightLobby.text.label, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.micro, letterSpacing: 1.5 },
  factValue: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.bodyLg },
  seatSection: { gap: spacing.sm },
  seatList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  seatItem: { alignItems: "center", backgroundColor: "rgba(14,22,48,0.88)", borderRadius: radius.md, gap: spacing.xs, minWidth: 78, padding: spacing.sm },
  seat: { alignItems: "center", borderColor: "#e0974a", borderRadius: radius.pill, borderWidth: border.thick, height: 36, justifyContent: "center", width: 36 },
  seatOpen: { backgroundColor: "transparent", borderColor: "rgba(243,230,196,0.45)", borderStyle: "dashed" },
  seatInitial: { color: "#f4ecd8", fontFamily: fonts.arcade, fontSize: fontSize.body },
  seatName: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.micro, maxWidth: 96 },
  lastWord: { backgroundColor: "rgba(14,22,48,0.88)", borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  lastWordLine: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  word: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h2, letterSpacing: 1 },
  points: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.h3 },
  actions: { paddingTop: spacing.sm },
});
