import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { HistoryHand } from "@wordpoker/contracts";

import { ChipSprite } from "@/components/chip/chip-sprite";
import { Pill } from "@/components/ui/pill";
import { colors, fonts, ledger } from "@/constants/theme";
import { localHistoryId, type LocalHistoryHand } from "@/lib/history/history-store";
import { chipColor, signedChips } from "@/utils/chips";
import { clock, clockSeconds, dayLabel } from "@/utils/date";

import { heroUsedTiles, logLines, netsBalance, recordBadge, seatViews, type LogLine, type SeatView } from "./hand-detail";
import { isLetter } from "./hands-page";
import { DealIn } from "./ledger/deal-in";
import { FeltPanel } from "./ledger/felt-panel";
import { GoldBackButton } from "./ledger/gold-back-button";
import { LedgerCard } from "./ledger/ledger-card";
import { LedgerList } from "./ledger/ledger-page";
import { MiniTile } from "./ledger/mini-tile";
import { SourcePill } from "./ledger/source-pill";

const LOG_ROW_HEIGHT = 30;
const DEALT_LOG_ROWS = 8;
const FOOTNOTE = "Shows your own tiles and tiles revealed at showdown. Opponents' drafts and hidden racks are never stored.";

const chips = new Intl.NumberFormat("en-US");
const nameOf = (hand: HistoryHand, id: string) => hand.seats.find((seat) => seat.playerId === id)?.name ?? id;

export function HandDetailPage({ row, loading, active, back }: {
  row: LocalHistoryHand | null;
  loading: boolean;
  active: boolean;
  back: () => void;
}) {
  const hand = row?.hand;
  const lines = useMemo(() => (hand ? logLines(hand) : []), [hand]);
  const seats = useMemo(() => (hand ? seatViews(hand) : []), [hand]);
  useEffect(() => {
    if (__DEV__ && hand && !netsBalance(seats)) console.warn(`Hand ${localHistoryId(hand)}: seat nets do not sum to zero.`);
  }, [hand, seats]);
  const hero = seats[0];
  return (
    <LedgerList
      accessibilityLabel="Hand Ledger detail"
      data={lines}
      extraData={active}
      keyExtractor={(line) => line.key}
      estimatedItemSize={LOG_ROW_HEIGHT}
      ListHeaderComponent={
        <View style={styles.page}>
          <View style={styles.header}>
            <GoldBackButton onPress={back} accessibilityLabel="Back to hands" />
            {hand && hero ? (
              <>
                <View accessible style={styles.heading}>
                  <Text accessibilityRole="header" style={styles.title}>{`HAND #${hand.handNo}`}</Text>
                  <Text style={styles.meta}>{`${dayLabel(hand.startedAtMs)} · ${clock(hand.startedAtMs)} · ${hand.tableName ?? (hand.mode === "offline" ? "Practice vs bots" : "Online session")}`}</Text>
                </View>
                <Text style={[styles.title, { color: chipColor(hero.net, "felt") }]}>{signedChips(hero.net)}</Text>
              </>
            ) : null}
          </View>
          {row && hand && hero ? (
            <>
              <Badge row={row} />
              <DealIn index={0} baseDelay={90} active={active}><Board hand={hand} hero={hero} /></DealIn>
              <DealIn index={1} baseDelay={90} active={active}>
                <View style={styles.seats}>{seats.map((seat) => <Seat key={seat.playerId} hand={hand} seat={seat} />)}</View>
              </DealIn>
              <DealIn index={2} baseDelay={90} active={active}><Pots hand={hand} /></DealIn>
              <DealIn index={3} baseDelay={90} active={active}>
                <View style={[styles.logEdge, styles.logTop]}><Text style={styles.label}>ACTION LOG</Text></View>
              </DealIn>
            </>
          ) : (
            <Text style={styles.empty}>{loading ? "Opening saved hand…" : "This hand is not saved on this device."}</Text>
          )}
        </View>
      }
      ListFooterComponent={hand ? (
        <View>
          <View style={[styles.logEdge, styles.logBottom]} />
          <Text style={styles.footnote}>{FOOTNOTE}</Text>
        </View>
      ) : null}
      renderItem={({ item, index }) => {
        const line = <LogRow line={item} />;
        return index < DEALT_LOG_ROWS ? <DealIn index={3} baseDelay={90} active={active}>{line}</DealIn> : line;
      }}
    />
  );
}

function Badge({ row }: { row: LocalHistoryHand }) {
  const badge = recordBadge(row);
  return (
    <View style={styles.badge}>
      <Pill label={badge.text} backgroundColor={badge.backgroundColor} color={badge.color} size="sm" />
      {row.status === "rejected" && row.error ? <Text style={styles.error}>{row.error}</Text> : null}
    </View>
  );
}

function Board({ hand, hero }: { hand: HistoryHand; hero: SeatView }) {
  const used = heroUsedTiles(hand);
  return (
    <FeltPanel style={styles.board}>
      <View style={styles.boardSide}>
        <Text style={styles.label}>COMMUNITY</Text>
        <View style={styles.tiles}>
          {hand.summary.community.length ? hand.summary.community.map((tile) => isLetter(tile.letter)
            ? <MiniTile key={tile.id} letter={tile.letter} tone={used && !used.has(tile.id) ? "dim" : "cream"} />
            : null) : <Text style={styles.meta}>Not revealed</Text>}
        </View>
      </View>
      <View style={[styles.boardSide, styles.end]}>
        <Text style={styles.label}>YOUR RACK</Text>
        <View style={styles.tiles}>
          {hero.tiles.map((tile) => isLetter(tile.letter) ? <MiniTile key={tile.id} letter={tile.letter} tone="gold" /> : null)}
        </View>
      </View>
    </FeltPanel>
  );
}

function Seat({ hand, seat }: { hand: HistoryHand; seat: SeatView }) {
  const index = hand.seats.findIndex((entry) => entry.playerId === seat.playerId);
  const winner = seat.won > 0;
  const word = seat.word && !seat.folded ? [...seat.word].filter(isLetter) : [];
  return (
    <LedgerCard size="row" tone={winner ? "winner" : seat.folded && !seat.isHero ? "muted" : "default"}>
      <View style={styles.seat}>
        <View style={styles.line}>
          <View style={[styles.avatar, { backgroundColor: colors.players[index % colors.players.length] }]}>
            <Text style={styles.initial}>{seat.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{seat.name}</Text>
          {seat.isBot ? <SourcePill source="bot" /> : null}
          {winner ? (
            <View style={styles.won}><Text style={styles.wonText}>{`WON ${chips.format(seat.won)}`}</Text></View>
          ) : null}
          <View style={styles.result}>
            <Text style={[styles.net, { color: chipColor(seat.net, "card") }]}>{signedChips(seat.net)}</Text>
            <Text style={styles.stack}>{`${chips.format(seat.start)} → ${chips.format(seat.end)}`}</Text>
          </View>
        </View>
        <View style={styles.note}>
          {word.map((letter, i) => <MiniTile key={i} letter={letter} size="sm" />)}
          {seat.folded && seat.isHero ? seat.tiles.map((tile) => isLetter(tile.letter)
            ? <MiniTile key={tile.id} letter={tile.letter} size="sm" opacity={0.55} /> : null) : null}
          <Text style={styles.stack}>{seat.folded ? (seat.isHero ? "You folded" : "Folded · rack stays private") : word.length ? `${seat.score} pts` : "No word"}</Text>
        </View>
      </View>
    </LedgerCard>
  );
}

function Pots({ hand }: { hand: HistoryHand }) {
  return (
    <View style={styles.pots}>
      {hand.summary.pots.map((pot, index) => (
        <View key={index} style={styles.pot}>
          <ChipSprite tone="gold" size={22} />
          <Text style={styles.potText}>{`${index === 0 ? "Main" : "Side"} pot ${chips.format(pot.amount)} → ${pot.winners.map((id) => nameOf(hand, id)).join(", ")}`}</Text>
        </View>
      ))}
    </View>
  );
}

function LogRow({ line }: { line: LogLine }) {
  return (
    <View style={[styles.logEdge, styles.logRow, line.source === null && styles.system]}>
      <Text style={styles.time}>{clockSeconds(line.atMs)}</Text>
      <Text style={styles.logText}>
        <Text style={styles.who}>{line.who}</Text>{` ${line.verb}`}
        {line.amount ? <Text style={styles.amount}>{` ${line.amount}`}</Text> : null}
      </Text>
      {line.source ? <SourcePill source={line.source} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 10, paddingBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  heading: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.arcade, fontSize: 22, lineHeight: 24, letterSpacing: 0.44, color: ledger.onFelt },
  meta: { fontFamily: fonts.rubikMedium, fontSize: 11, color: ledger.onFeltDim },
  empty: { fontFamily: fonts.rubikMedium, fontSize: 13, color: ledger.onFelt },
  badge: { alignItems: "flex-start", gap: 8 },
  error: { alignSelf: "stretch", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: ledger.rejectedBg, fontFamily: fonts.rubikMedium, fontSize: 11.5, lineHeight: 16.1, color: ledger.rejectedInk },
  label: { fontFamily: fonts.rubikSemiBold, fontSize: 9.5, letterSpacing: 0.95, color: ledger.onFeltDim },
  board: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  boardSide: { gap: 6 },
  end: { alignItems: "flex-end" },
  tiles: { flexDirection: "row", gap: 3 },
  seats: { gap: 8, paddingBottom: 8 },
  seat: { paddingVertical: 10, gap: 7 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: ledger.goldEdge, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: fonts.arcade, fontSize: 14, color: "#2a1906" },
  name: { fontFamily: fonts.arcade, fontSize: 16, color: ledger.ink },
  won: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 7, backgroundColor: ledger.modeTile, borderWidth: 1.5, borderColor: ledger.goldEdge },
  wonText: { fontFamily: fonts.arcade, fontSize: 10, letterSpacing: 0.6, color: ledger.goldText },
  result: { marginLeft: "auto", alignItems: "flex-end", gap: 2 },
  net: { fontFamily: fonts.arcade, fontSize: 15 },
  stack: { fontFamily: fonts.rubikMedium, fontSize: 10.5, color: ledger.inkSoft, fontVariant: ["tabular-nums"] },
  note: { minHeight: 21, marginLeft: 38, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  pots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pot: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingVertical: 6, paddingRight: 12, paddingLeft: 6, backgroundColor: "rgba(0,0,0,.28)", borderWidth: 2, borderColor: ledger.goldEdge },
  potText: { fontFamily: fonts.arcade, fontSize: 13, color: ledger.parchment },
  // Rows are absolutely positioned list items, so the panel is drawn as top, side and bottom pieces.
  logEdge: { paddingHorizontal: 12, backgroundColor: colors.surface, borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 },
  logTop: { paddingTop: 12, paddingBottom: 6, borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  logBottom: { height: 12, borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "rgba(243,230,196,.1)", borderLeftColor: colors.border },
  system: { opacity: 0.75 },
  time: { width: 52, fontFamily: fonts.rubikMedium, fontSize: 10, lineHeight: 16, color: ledger.onFeltDim, fontVariant: ["tabular-nums"] },
  logText: { flex: 1, fontFamily: fonts.rubik, fontSize: 12, lineHeight: 16, color: ledger.onFelt },
  who: { fontFamily: fonts.rubikSemiBold, color: ledger.onFelt },
  amount: { fontFamily: fonts.rubikSemiBold, color: ledger.goldText },
  footnote: { paddingTop: 10, fontFamily: fonts.rubikMedium, fontSize: 10.5, lineHeight: 14.7, color: ledger.onFeltDim },
});
