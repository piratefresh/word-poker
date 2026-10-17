import { Button, Column, Host, Text } from "@expo/ui";
import { useMemo } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import type { HistoryHand } from "@wordpoker/contracts";
import { colors, fonts, spacing } from "@/constants/theme";
import { useHistory } from "@/lib/history/history-provider";
import type { LocalHistoryHand } from "@/lib/history/history-store";
import { localHistoryId } from "@/lib/history/history-store";
import { DealIn } from "./ledger/deal-in";
import { GoldBackButton } from "./ledger/gold-back-button";
import { LedgerCard } from "./ledger/ledger-card";
import { LedgerPage } from "./ledger/ledger-page";
import { PageStack } from "./ledger/page-stack";
import { useLedgerReadable } from "./ledger/ledger-stage";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";

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
  const history = useHistory();
  const readable = useLedgerReadable();
  const reduced = useReduceMotion();
  const dealActive = revealed && readable && !reduced;
  const sessions = useMemo(() => {
    const grouped = new Map<string, LocalHistoryHand[]>();
    for (const row of history.hands) {
      const group = grouped.get(row.hand.sessionId) ?? [];
      group.push(row);
      grouped.set(row.hand.sessionId, group);
    }
    return [...grouped.entries()];
  }, [history.hands]);
  const rows = history.hands.filter((row) => row.hand.sessionId === sessionId);
  const selected = rows.find((row) => row.hand.id === handId || localHistoryId(row.hand) === handId);
  return <PageStack level={level}>{[
    <LedgerPage key="sessions" accessibilityLabel="Hand Ledger sessions">
      <NativeText style={styles.title}>HAND LEDGER</NativeText>
      <Host matchContents={{ vertical: true }} colorScheme="dark">
        <Button label={history.syncing ? "Syncing…" : "Sync"} onPress={history.refresh} disabled={history.syncing} testID="history-sync" />
      </Host>
      {history.error ? <NativeText style={styles.dim}>{history.error}</NativeText> : null}
      {sessions.map(([id, hands], index) => <DealIn key={id} index={index} active={level === 0 && dealActive}>
        <LedgerCard accessibilityLabel={"View session " + (hands[0].hand.tableName ?? id)} onPress={() => openSession(id)}>
          <NativeText style={styles.cardTitle}>{hands[0].hand.tableName ?? (hands[0].hand.mode === "offline" ? "Offline session" : "Online session")}</NativeText>
          <NativeText>{new Date(hands[0].hand.endedAtMs).toLocaleString() + " · " + hands.length + (hands.length === 1 ? " hand" : " hands")}</NativeText>
          <NativeText>{status(hands[0])}</NativeText>
        </LedgerCard>
      </DealIn>)}
      {!sessions.length ? <NativeText style={styles.body}>{history.loading ? "Opening saved hands…" : "Your next hand starts here. Finish a hand to see it in your ledger."}</NativeText> : null}
    </LedgerPage>,
    <LedgerPage key={"hands-" + (sessionId ?? "")} accessibilityLabel="Hand Ledger hands">
      <GoldBackButton onPress={back} accessibilityLabel="Back to sessions" />
      <NativeText style={styles.title}>SESSION HANDS</NativeText>
      {rows.map((row, index) => <DealIn key={localHistoryId(row.hand)} index={index} active={level === 1 && dealActive}>
        <LedgerCard accessibilityLabel={"View hand " + row.hand.handNo} onPress={() => openHand(row.hand.id)}>
          <NativeText style={styles.cardTitle}>{"Hand #" + row.hand.handNo}</NativeText>
          <NativeText>{handLabel(row.hand)}</NativeText>
          <NativeText>{status(row)}</NativeText>
        </LedgerCard>
      </DealIn>)}
      {!rows.length ? <NativeText style={styles.body}>{history.loading ? "Opening saved hands…" : "This session is not saved on this device."}</NativeText> : null}
    </LedgerPage>,
    <LedgerPage key={"detail-" + (sessionId ?? "") + "-" + (handId ?? "")} accessibilityLabel="Hand Ledger detail">
      <GoldBackButton onPress={back} accessibilityLabel="Back to hands" />
      <NativeText style={styles.title}>{selected ? "HAND #" + selected.hand.handNo : "HAND DETAIL"}</NativeText>
      <DealIn index={0} active={level === 2 && dealActive}>
        {selected ? <HandDetail row={selected} /> : <NativeText style={styles.body}>{history.loading ? "Opening saved hand…" : "This hand is not saved on this device."}</NativeText>}
      </DealIn>
    </LedgerPage>,
  ]}</PageStack>;
}

function handLabel(hand: HistoryHand): string {
  const hero = hand.summary.seats.find((seat) => seat.playerId === hand.heroId);
  const initial = hand.seats.find((seat) => seat.playerId === hand.heroId)?.initialStack ?? 0;
  const delta = (hero?.finalStack ?? initial) - initial;
  return `${hero?.word ?? (hand.summary.outcome === "fold-out" ? "Fold-out" : "No submitted word")} · ${hero?.score ?? 0} points · ${delta >= 0 ? "+" : ""}${delta} chips`;
}

function HandDetail({ row }: { row: LocalHistoryHand }) {
  const hand = row.hand;
  return <View>
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
  {hand.actions.map((item) => <Host key={item.sequence} matchContents={{ vertical: true }} style={styles.host} colorScheme="dark"><Column style={styles.action}>
    <Text textStyle={styles.body}>{actionLabel(hand, item)}</Text>
    <Text textStyle={styles.dim}>{`${new Date(item.atMs).toLocaleTimeString()} · ${item.source}`}</Text>
  </Column></Host>)}
  </View>;
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
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md },
  card: { padding: spacing.md, margin: spacing.sm, backgroundColor: colors.surface, borderRadius: 16 },
  action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 18 },
  body: { color: colors.textBright, fontFamily: fonts.sans, fontSize: 14 },
  dim: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 12 },
});
