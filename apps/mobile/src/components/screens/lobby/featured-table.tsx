/** The featured open room at the top of the night lobby. */

import { LinearGradient } from "expo-linear-gradient";
import { type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAX_SEATS, type RoomSummary } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";

import { GoldButton } from "@/components/ui/gold-button";
import { border, colors, fonts, fontSize, nightLobby, radius, spacing } from "@/constants/theme";
import { formatAmount } from "@/lib/ui/format";
import { isJoinable, openSeats } from "@/features/online/lobby-view";
import { powersLabel } from "@/features/table/power-view";
import { buyInNote, cannotAfford, needCoinsLabel, spokenTable } from "./parlor-view";

export interface FeaturedTableCardProps {
  readonly room: RoomSummary;
  readonly onJoin: () => void;
  readonly onDetails: () => void;
  readonly joining?: boolean;
  readonly yours?: boolean;
  /** The Wallet's coins; `null` while unread. */
  readonly coins?: number | null;
}

export function FeaturedTableCard({
  room,
  onJoin,
  onDetails,
  joining = false,
  yours = false,
  coins = null,
}: FeaturedTableCardProps): ReactElement {
  const lastWord = room.metadata.lastWord;
  const players = room.metadata.players ?? [];
  const seats = Math.min(room.maxClients, MAX_SEATS);
  const mode = powersLabel(room.metadata.powerUps) ?? "Classic";
  const short = !yours && cannotAfford(room, coins);
  const canJoin = (isJoinable(room) && !short) || yours;

  return (
    <View style={styles.card} testID="parlor-featured">
      <LinearGradient colors={nightLobby.panel.headliner} end={{ x: 0.5, y: 1 }} start={{ x: 0.5, y: 0 }} style={StyleSheet.absoluteFill} />
      <Pressable
        accessibilityLabel={`${room.metadata.name}, featured room. ${spokenTable(room, yours)}. Show details.`}
        accessibilityRole="button"
        onPress={onDetails}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        testID="lobby-headliner-details"
      >
        <View style={styles.topline}>
          <Text style={styles.kicker}>HEADLINER</Text>
          <View style={styles.status}>
            <View style={[styles.dot, styles.dotLive]} />
            <Text style={[styles.statusText, styles.live]}>LIVE</Text>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.name}>{room.metadata.name}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {mode} · {room.metadata.hostName ? `hosted by ${room.metadata.hostName}` : `${formatAmount(room.metadata.buyIn)} buy-in`}
        </Text>

        {lastWord === undefined ? null : (
          <View style={styles.lastWord}>
            <View style={styles.wordBlock}>
              <View style={styles.tiles}>
                {Array.from(lastWord.word).slice(0, 12).map((letter, index) => (
                  <View key={`${letter}-${index}`} style={styles.tile}>
                    <Text style={styles.tileLetter}>{letter}</Text>
                    <Text style={styles.tilePoints}>{LETTER_VALUES[letter as Letter] ?? ""}</Text>
                  </View>
                ))}
              </View>
              <Text numberOfLines={1} style={styles.wordBy}>{lastWord.by}&apos;s last word</Text>
            </View>
            <Text style={styles.points}>+{lastWord.points}</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.seatMarkers} accessibilityLabel={`${room.clients} seated, ${openSeats(room)} open`}>
          {Array.from({ length: seats }, (_, index) => {
            const player = players[index];
            const taken = index < room.clients;
            const color = player?.color ?? colors.players[index % colors.players.length];
            return (
              <View
                key={player?.id ?? index}
                style={[styles.seat, taken ? { backgroundColor: color, borderColor: "#e0974a" } : styles.seatOpen]}
              >
                <Text style={[styles.seatInitial, !taken && styles.seatInitialOpen]}>
                  {taken ? player?.initial ?? "•" : ""}
                </Text>
              </View>
            );
          })}
          <Text style={styles.openCount}>{room.locked ? "UNAVAILABLE" : `${openSeats(room)} OPEN`}</Text>
        </View>
        <Text style={styles.buyIn}>{formatAmount(room.metadata.buyIn)}</Text>
      </View>

      <GoldButton
        accessibilityLabel={spokenTable(room, yours)}
        disabled={!canJoin || joining}
        label={joining ? "TAKING YOUR SEAT…" : yours ? "BACK TO YOUR SEAT" : short && isJoinable(room) ? needCoinsLabel(room) : `JOIN · ${formatAmount(room.metadata.buyIn)}`}
        onPress={onJoin}
        testID="parlor-featured-join"
      />
      {yours ? null : <Text style={styles.note}>{buyInNote(room)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: "#e0974a",
    borderRadius: 20,
    borderWidth: border.thick,
    gap: spacing.md,
    marginHorizontal: spacing.gutter,
    overflow: "hidden",
    padding: spacing.md,
  },
  body: { gap: spacing.xs },
  pressed: { opacity: 0.82 },
  topline: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 1.8 },
  status: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  dot: { borderRadius: radius.pill, height: 7, width: 7 },
  dotLive: { backgroundColor: nightLobby.status.live },
  statusText: { fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 1.2 },
  live: { color: nightLobby.status.live },
  name: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h2, letterSpacing: 0.8 },
  subtitle: { color: nightLobby.text.muted, fontFamily: fonts.rubikMedium, fontSize: fontSize.small },
  lastWord: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.sm },
  wordBlock: { flex: 1, gap: spacing.xs, minWidth: 0 },
  tiles: { flexDirection: "row", gap: 3 },
  tile: { alignItems: "center", backgroundColor: "#f0dbb2", borderRadius: 4, height: 29, justifyContent: "center", position: "relative", width: 24 },
  tileLetter: { color: "#2b1c10", fontFamily: fonts.arcade, fontSize: fontSize.bodyLg },
  tilePoints: { bottom: 0, color: "#2b1c10", fontFamily: fonts.rubikSemiBold, fontSize: 7, position: "absolute", right: 2 },
  wordBy: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.caption },
  points: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.h2, paddingLeft: spacing.sm },
  footer: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  seatMarkers: { alignItems: "center", flexDirection: "row", gap: spacing.xs, flex: 1, minWidth: 0 },
  seat: { alignItems: "center", borderRadius: radius.pill, borderWidth: border.thick, height: 29, justifyContent: "center", width: 29 },
  seatOpen: { backgroundColor: "rgba(8,12,28,0.45)", borderColor: "rgba(243,230,196,0.45)", borderStyle: "dashed" },
  seatInitial: { color: "#f4ecd8", fontFamily: fonts.arcade, fontSize: fontSize.small },
  seatInitialOpen: { color: nightLobby.text.muted },
  openCount: { color: nightLobby.status.open, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 0.8, marginLeft: spacing.xs },
  buyIn: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.h3 },
  note: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.small, marginTop: spacing.sm, textAlign: "center" },
});
