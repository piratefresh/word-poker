import { Button, Column, Host, Row, Spacer, Text } from "@expo/ui";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HistoryHand } from "@wordpoker/contracts";
import { colors, fonts, spacing } from "@/constants/theme";
import { useHistory } from "@/lib/history/history-provider";
import type { LocalHistoryHand } from "@/lib/history/history-store";
import { localHistoryId } from "@/lib/history/history-store";

function status(row: LocalHistoryHand): string {
  if (row.status === "rejected") return "Upload rejected";
  if (row.status === "pending") return "Pending sync · Unranked offline";
  return row.hand.ranked ? "Ranked online" : "Verified · Unranked offline";
}

export function HistoryScreen() {
  const history = useHistory();
  const { refresh } = history;
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const insets = useSafeAreaInsets();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [handId, setHandId] = useState<string | null>(null);
  const selected = history.hands.find((row) => localHistoryId(row.hand) === handId);
  const sessions = useMemo(() => {
    const grouped = new Map<string, LocalHistoryHand[]>();
    for (const row of history.hands) {
      const group = grouped.get(row.hand.sessionId) ?? [];
      group.push(row);
      grouped.set(row.hand.sessionId, group);
    }
    return [...grouped.entries()];
  }, [history.hands]);
  const back = () => {
    if (handId) setHandId(null);
    else if (sessionId) setSessionId(null);
  };
  const rows = sessionId ? history.hands.filter((row) => row.hand.sessionId === sessionId) : [];
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]} testID="history-screen">
      <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark" seedColor={colors.gold}>
        <Column spacing={spacing.sm} style={styles.header}>
          <Row spacing={spacing.md}>
            {handId || sessionId ? <Button label="Back" onPress={back} testID="history-back" /> : null}
            <Spacer flexible />
            <Button label={history.syncing ? "Syncing…" : "Sync"} onPress={history.refresh} disabled={history.syncing} testID="history-sync" />
          </Row>
          <Text textStyle={styles.title}>{selected ? `HAND #${selected.hand.handNo}` : "GAME HISTORY"}</Text>
          {history.error ? <Text textStyle={styles.dim}>{history.error}</Text> : null}
        </Column>
      </Host>
      {/* Host rows acquire their height from native layout; clipping them at zero height prevents measurement. */}
      {selected ? <HandDetail row={selected} /> : sessionId ? (
        <FlatList removeClippedSubviews={false} data={rows} keyExtractor={(row) => row.hand.id} renderItem={({ item }) => (
          <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark">
            <Column spacing={spacing.xs} style={styles.card}>
              <Text textStyle={styles.title}>{`Hand #${item.hand.handNo}`}</Text>
              <Text textStyle={styles.dim}>{new Date(item.hand.endedAtMs).toLocaleString()}</Text>
              <Text textStyle={styles.dim}>{status(item)}</Text>
              <Text textStyle={styles.body}>{handLabel(item.hand)}</Text>
              <Button label="View hand" onPress={() => setHandId(localHistoryId(item.hand))} testID={`history-hand-${item.hand.handNo}`} />
            </Column>
          </Host>
        )} />
      ) : (
        <FlatList removeClippedSubviews={false} data={sessions} keyExtractor={([id]) => id} renderItem={({ item: [id, hands] }) => (
          <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark">
            <Column spacing={spacing.xs} style={styles.card}>
              <Text textStyle={styles.title}>{hands[0].hand.tableName ?? `${hands[0].hand.mode === "offline" ? "Offline" : "Online"} session`}</Text>
              <Text textStyle={styles.dim}>{`${new Date(hands[0].hand.endedAtMs).toLocaleString()} · ${hands.length} hand${hands.length === 1 ? "" : "s"}`}</Text>
              <Text textStyle={styles.dim}>{hands.some((hand) => hand.status === "pending") ? "Pending sync" : status(hands[0])}</Text>
              <Button label="View session" onPress={() => setSessionId(id)} testID={`history-session-${id}`} />
            </Column>
          </Host>
        )} ListEmptyComponent={
          <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column style={styles.card} spacing={spacing.sm}>
            <Text textStyle={styles.title}>{history.loading ? "Opening saved hands…" : "Your next hand starts here"}</Text>
            <Text textStyle={styles.dim}>Finish an online or offline hand, then return here to see the result. Saved hands stay available without a connection.</Text>
            <Button label="Play offline" onPress={() => router.push("/offline")} testID="history-play" />
          </Column></Host>
        } />
      )}
    </View>
  );
}

function handLabel(hand: HistoryHand): string {
  const hero = hand.summary.seats.find((seat) => seat.playerId === hand.heroId);
  const initial = hand.seats.find((seat) => seat.playerId === hand.heroId)?.initialStack ?? 0;
  const delta = (hero?.finalStack ?? initial) - initial;
  return `${hero?.word ?? (hand.summary.outcome === "fold-out" ? "Fold-out" : "No submitted word")} · ${hero?.score ?? 0} points · ${delta >= 0 ? "+" : ""}${delta} chips`;
}

function HandDetail({ row }: { row: LocalHistoryHand }) {
  const hand = row.hand;
  return <FlatList removeClippedSubviews={false} data={hand.actions} keyExtractor={(entry) => String(entry.sequence)} ListHeaderComponent={
    <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column spacing={spacing.sm} style={styles.card}>
      <Text textStyle={styles.title}>{handLabel(hand)}</Text>
      <Text textStyle={styles.dim}>{status(row)}</Text>
      {row.error ? <Text textStyle={styles.dim}>{row.error}</Text> : null}
      <Text textStyle={styles.dim}>{`${new Date(hand.endedAtMs).toLocaleString()} · ${hand.dictionaryId}`}</Text>
      <Text textStyle={styles.body}>{`Community: ${hand.summary.community.map((tile) => tile.letter).join(" ") || "Not revealed"}`}</Text>
      {hand.seats.map((seat) => {
        const result = hand.summary.seats.find((standing) => standing.playerId === seat.playerId);
        const delta = (result?.finalStack ?? seat.initialStack) - seat.initialStack;
        return <Column key={seat.playerId} spacing={spacing.xs}>
          <Text textStyle={styles.title}>{seat.name}</Text>
          <Text textStyle={styles.body}>{`${result?.word ?? "No revealed word"} · ${result?.score ?? 0} points${result?.reason ? ` · ${result.reason}` : ""}`}</Text>
          <Text textStyle={styles.dim}>{`Tiles: ${result?.privateTiles.map((tile) => tile.letter).join(" ") || "Hidden"}`}</Text>
          <Text textStyle={styles.dim}>{`${seat.initialStack} → ${result?.finalStack ?? seat.initialStack} chips (${delta >= 0 ? "+" : ""}${delta})`}</Text>
        </Column>;
      })}
      <Text textStyle={styles.title}>POTS</Text>
      {hand.summary.pots.map((pot, index) => <Text key={index} textStyle={styles.body}>
        {`${pot.amount} chips → ${pot.winners.map((id) => hand.seats.find((seat) => seat.playerId === id)?.name ?? id).join(", ")}`}
      </Text>)}
      <Text textStyle={styles.dim}>Only your tiles and the tiles revealed at showdown are shown. Private drafts belong to their player.</Text>
      <Text textStyle={styles.title}>ACTION LOG</Text>
    </Column></Host>
  } renderItem={({ item }) => <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column style={styles.action}>
    <Text textStyle={styles.body}>{actionLabel(hand, item)}</Text>
    <Text textStyle={styles.dim}>{`${new Date(item.atMs).toLocaleTimeString()} · ${item.source}`}</Text>
  </Column></Host>} />;
}

function actionLabel(hand: HistoryHand, entry: HistoryHand["actions"][number]): string {
  const action = entry.action;
  const playerId = "playerId" in action ? action.playerId : null;
  const name = playerId ? hand.seats.find((seat) => seat.playerId === playerId)?.name ?? playerId : "Clock";
  return `${entry.sequence + 1}. ${name} · ${action.type}${"amount" in action ? ` ${action.amount}` : ""}`;
}

const styles = StyleSheet.create({
  host: { width: "100%" },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md },
  card: { padding: spacing.md, margin: spacing.sm, backgroundColor: colors.surface, borderRadius: 16 },
  action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 18 },
  body: { color: colors.textBright, fontFamily: fonts.sans, fontSize: 14 },
  dim: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 12 },
});
