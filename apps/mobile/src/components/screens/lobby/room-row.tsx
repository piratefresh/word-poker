/** A compact room row; tapping opens its details, while the sheet owns the join action. */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAX_SEATS, type RoomSummary } from "@wordpoker/contracts";

import { border, colors, fonts, fontSize, nightLobby, opacity, radius, spacing } from "@/constants/theme";
import { formatAmount } from "@/lib/ui/format";
import { openSeats } from "@/features/online/lobby-view";
import { powersLabel } from "@/features/table/power-view";
import { spokenTable } from "./parlor-view";

export type RoomRowProps = {
  room: RoomSummary;
  yours?: boolean;
  hosted?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function RoomRow({ room, yours = false, hosted = false, disabled = false, onPress }: RoomRowProps) {
  const players = room.metadata.players ?? [];
  const pipCount = Math.min(room.maxClients, MAX_SEATS);
  const mode = powersLabel(room.metadata.powerUps) ?? "Classic";
  const seatsOpen = openSeats(room);

  return (
    <Pressable
      accessibilityHint="Opens room details"
      accessibilityLabel={`${spokenTable(room, yours)}${hosted ? ", hosted by you" : ""}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        (yours || hosted) && styles.owned,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={`lobby-room-${room.roomId}`}
    >
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>{room.metadata.name}</Text>
          {yours ? <Text style={styles.hosted}>SEATED</Text> : hosted ? <Text style={styles.hosted}>HOSTED</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.subtitle}>
          {mode}{room.metadata.hostName ? ` · hosted by ${room.metadata.hostName}` : ""}
        </Text>
        <View style={styles.pips}>
          {Array.from({ length: pipCount }, (_, index) => {
            const player = players[index];
            const taken = index < room.clients;
            return (
              <View
                key={player?.id ?? index}
                style={[
                  styles.pip,
                  taken
                    ? { backgroundColor: player?.color ?? colors.players[index % colors.players.length] }
                    : styles.pipOpen,
                ]}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.terms}>
        <Text style={styles.buyIn}>{formatAmount(room.metadata.buyIn)}</Text>
        <Text style={[styles.open, room.locked || seatsOpen === 0 ? styles.full : null]}>
          {room.locked ? "UNAVAILABLE" : seatsOpen === 0 ? "FULL" : `${seatsOpen} OPEN`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: nightLobby.panel.row,
    borderColor: nightLobby.border.subtle,
    borderRadius: 16,
    borderWidth: border.thin,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    width: "100%",
  },
  owned: { borderColor: "rgba(247,215,122,0.5)" },
  pressed: { borderColor: nightLobby.gold.light, opacity: opacity.pressed },
  disabled: { opacity: opacity.disabled },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  name: { color: nightLobby.text.cream, flexShrink: 1, fontFamily: fonts.arcade, fontSize: fontSize.bodyLg, letterSpacing: 0.3 },
  hosted: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.micro, letterSpacing: 1 },
  subtitle: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.caption },
  pips: { flexDirection: "row", gap: 4, paddingTop: 2 },
  pip: { borderRadius: radius.pill, height: 8, width: 8 },
  pipOpen: { borderColor: "rgba(243,230,196,0.45)", borderWidth: border.thin },
  terms: { alignItems: "flex-end", gap: spacing.xs },
  buyIn: { color: nightLobby.gold.light, fontFamily: fonts.arcade, fontSize: fontSize.bodyLg },
  open: { color: nightLobby.status.open, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.micro, letterSpacing: 1 },
  full: { color: nightLobby.status.full },
});
