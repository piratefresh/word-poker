import { Column, Host, Text } from "@expo/ui";
import type { ReactNode } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import type { HistoryHand } from "@wordpoker/contracts";
import { colors, fonts, spacing } from "@/constants/theme";
import { localHistoryId, type LocalHistoryHand } from "@/lib/history/history-store";
import { useHistoryHand, useSessionHands } from "@/lib/history/use-history-pages";
import { SessionsPage } from "./sessions-page";
import { DealIn } from "./ledger/deal-in";
import { GoldBackButton } from "./ledger/gold-back-button";
import { LedgerCard } from "./ledger/ledger-card";
import { LedgerList } from "./ledger/ledger-page";
import { PageStack } from "./ledger/page-stack";
import { useLedgerReadable } from "./ledger/ledger-stage";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";

const ROW_HEIGHT = 110;
const ACTION_HEIGHT = 56;
const DEALT_ROWS = 8;

function status(row: LocalHistoryHand): string {
  if (row.status === "rejected") return "Upload rejected";
  if (row.status === "pending") return "Pending sync · Unranked offline";
  return row.hand.ranked ? "Ranked online" : "Verified · Unranked offline";
}

export function HistoryScreen({ level, sessionId, handId, revealed, back, openSession, openHand }: {
  level: number;
  sessionId?: string;
  handId?: string;
  revealed: boolean;
  back: () => void;
  openSession: (id: string) => void;
  openHand: (id: string) => void;
}) {
  const readable = useLedgerReadable();
  const reduced = useReduceMotion();
  const dealActive = revealed && readable && !reduced;
  const hands = useSessionHands(sessionId);
  const detail = useHistoryHand(handId);
  const selected = detail.row?.hand.sessionId === sessionId ? detail.row : null;
  const dealing = (page: number) => dealActive && page === level;
  return <PageStack level={level}>{[
    <SessionsPage key="sessions" active={dealing(0)} openSession={openSession} />,
    <LedgerList key={"hands-" + (sessionId ?? "")} accessibilityLabel="Hand Ledger hands" data={hands.items} extraData={dealing(1)} onEndReached={hands.loadMore} onEndReachedThreshold={0.5}
      keyExtractor={(row) => localHistoryId(row.hand)} estimatedItemSize={ROW_HEIGHT}
      ListHeaderComponent={<View style={styles.header}>
        <GoldBackButton onPress={back} accessibilityLabel="Back to sessions" />
        <NativeText style={styles.title}>SESSION HANDS</NativeText>
      </View>}
      ListEmptyComponent={<NativeText style={styles.body}>{hands.loading ? "Opening saved hands…" : "This session is not saved on this device."}</NativeText>}
      renderItem={({ item: row, index }) => <Row index={index} active={dealing(1)}>
        <LedgerCard accessibilityLabel={"View hand " + row.hand.handNo} onPress={() => openHand(localHistoryId(row.hand))}>
          <NativeText style={styles.cardTitle}>{"Hand #" + row.hand.handNo}</NativeText>
          <NativeText>{handLabel(row.hand)}</NativeText>
          <NativeText>{status(row)}</NativeText>
        </LedgerCard>
      </Row>} />,
    <LedgerList key={"detail-" + (sessionId ?? "") + "-" + (handId ?? "")} accessibilityLabel="Hand Ledger detail"
      data={selected?.hand.actions ?? []} keyExtractor={(entry) => String(entry.sequence)} estimatedItemSize={ACTION_HEIGHT}
      ListHeaderComponent={<View style={styles.header}>
        <GoldBackButton onPress={back} accessibilityLabel="Back to hands" />
        <NativeText style={styles.title}>{selected ? "HAND #" + selected.hand.handNo : "HAND DETAIL"}</NativeText>
        <DealIn index={0} active={dealing(2)}>
          {selected ? <HandSummary row={selected} /> : <NativeText style={styles.body}>{detail.loading ? "Opening saved hand…" : "This hand is not saved on this device."}</NativeText>}
        </DealIn>
      </View>}
      renderItem={({ item }) => selected ? <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column style={styles.action}>
        <Text textStyle={styles.body}>{actionLabel(selected.hand, item)}</Text>
        <Text textStyle={styles.dim}>{`${new Date(item.atMs).toLocaleTimeString()} · ${item.source}`}</Text>
      </Column></Host> : null} />,
  ]}</PageStack>;
}

// A virtualized row mounts as it scrolls in, so only the first screenful deals; later rows would replay on scroll.
function Row({ index, active, children }: { index: number; active: boolean; children: ReactNode }) {
  const row = <View style={styles.row}>{children}</View>;
  return index < DEALT_ROWS ? <DealIn index={index} active={active}>{row}</DealIn> : row;
}

function handLabel(hand: HistoryHand): string {
  const hero = hand.summary.seats.find((seat) => seat.playerId === hand.heroId);
  const initial = hand.seats.find((seat) => seat.playerId === hand.heroId)?.initialStack ?? 0;
  const delta = (hero?.finalStack ?? initial) - initial;
  return `${hero?.word ?? (hand.summary.outcome === "fold-out" ? "Fold-out" : "No submitted word")} · ${hero?.score ?? 0} points · ${delta >= 0 ? "+" : ""}${delta} chips`;
}

function HandSummary({ row }: { row: LocalHistoryHand }) {
  const hand = row.hand;
  return <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column spacing={spacing.sm} style={styles.card}>
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
  </Column></Host>;
}

function actionLabel(hand: HistoryHand, entry: HistoryHand["actions"][number]): string {
  const action = entry.action;
  const playerId = "playerId" in action ? action.playerId : null;
  const name = playerId ? hand.seats.find((seat) => seat.playerId === playerId)?.name ?? playerId : "Clock";
  return `${entry.sequence + 1}. ${name} · ${action.type}${"amount" in action ? ` ${action.amount}` : ""}`;
}

const styles = StyleSheet.create({
  cardTitle: { color: colors.onGold, fontFamily: fonts.serifBold, fontSize: 18 },
  host: { width: "100%" },
  header: { gap: 10, paddingBottom: 10 },
  row: { paddingBottom: 10 },
  card: { padding: spacing.md, margin: spacing.sm, backgroundColor: colors.surface, borderRadius: 16 },
  action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 18 },
  body: { color: colors.textBright, fontFamily: fonts.sans, fontSize: 14 },
  dim: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 12 },
});
