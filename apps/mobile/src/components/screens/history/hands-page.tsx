import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { HistoryHand } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";

import { fonts, ledger } from "@/constants/theme";
import { useHistory } from "@/lib/history/history-provider";
import {
  localHistoryId,
  sessionName,
  sessionStatus,
  type HistorySession,
  type LocalHistoryHand,
} from "@/lib/history/history-store";
import {
  useHistorySession,
  useSessionHands,
} from "@/lib/history/use-history-pages";
import { chipColor, signedChips } from "@/utils/chips";
import { clock, dayLabel } from "@/utils/date";

import { historyWordTiles } from "./hand-detail";
import { DealIn } from "./ledger/deal-in";
import { GoldBackButton } from "./ledger/gold-back-button";
import { LedgerCard } from "./ledger/ledger-card";
import { LedgerList } from "./ledger/ledger-page";
import { MiniTile } from "./ledger/mini-tile";
import { statusLabel } from "./ledger/status-pill";

/** Only the first screenful deals; later virtualized rows render at rest. */
const DEALT_ROWS = 10;

export interface HandResult {
  word: string | null;
  folded: boolean;
  score: number;
  net: number;
}

/** The hero's side of a hand: their word, score and net chips. */
export function handResult(hand: HistoryHand): HandResult {
  const hero = hand.summary.seats.find((seat) => seat.playerId === hand.heroId);
  const initial =
    hand.seats.find((seat) => seat.playerId === hand.heroId)?.initialStack ?? 0;
  return {
    word: hero?.word ?? null,
    folded: hand.actions.some(
      ({ action }) => action.type === "fold" && action.playerId === hand.heroId,
    ),
    score: hero?.score ?? 0,
    net: (hero?.finalStack ?? initial) - initial,
  };
}

export function handRowLabel(hand: HistoryHand): string {
  const { word, folded, score, net } = handResult(hand);
  const chips =
    net === 0 ? "even" : `${net > 0 ? "won" : "lost"} ${Math.abs(net)} chips`;
  if (folded) return `Hand ${hand.handNo}, folded, ${chips}`;
  return `Hand ${hand.handNo}, ${clock(hand.startedAtMs)}, ${word ? `word ${word}, ${score} points` : "no word"}, ${chips}`;
}

export function sessionMeta(
  session: HistorySession,
  uploadingSessionId: string | null,
): string {
  const parts = [
    dayLabel(session.startedAtMs),
    clock(session.startedAtMs),
    `${session.hands} ${session.hands === 1 ? "hand" : "hands"}`,
    statusLabel(sessionStatus(session, uploadingSessionId)),
  ];
  if (session.latest.hand.mode === "offline") parts.push("UNRANKED");
  return parts.join(" · ");
}

export const isLetter = (value: string): value is Letter =>
  value in LETTER_VALUES;

export function HandsPage({
  sessionId,
  active,
  back,
  openHand,
}: {
  sessionId: string | undefined;
  active: boolean;
  back: () => void;
  openHand: (id: string) => void;
}) {
  const hands = useSessionHands(sessionId);
  const session = useHistorySession(sessionId);
  const { uploadingSessionId } = useHistory();
  return (
    <LedgerList
      accessibilityLabel="Hand Ledger hands"
      data={hands.items}
      extraData={active}
      keyExtractor={(row) => localHistoryId(row.hand)}
      onEndReached={hands.loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <GoldBackButton
            onPress={back}
            accessibilityLabel="Back to sessions"
          />
          {session.row ? (
            <View accessible style={styles.heading}>
              <Text accessibilityRole="header" style={styles.name}>
                {sessionName(session.row)}
              </Text>
              <Text style={styles.meta}>
                {sessionMeta(session.row, uploadingSessionId)}
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {hands.loading
            ? "Opening saved hands…"
            : "This session is not saved on this device."}
        </Text>
      }
      renderItem={({ item, index }) => {
        const row = (
          <View style={styles.gap}>
            <HandRow
              row={item}
              open={() => openHand(localHistoryId(item.hand))}
            />
          </View>
        );
        // A virtualized row mounts as it scrolls in, so only the first screenful deals.
        return index < DEALT_ROWS ? (
          <DealIn index={index} baseDelay={90} active={active}>
            {row}
          </DealIn>
        ) : (
          row
        );
      }}
    />
  );
}

export function HandRow({
  row,
  open,
}: {
  row: LocalHistoryHand;
  open: () => void;
}) {
  const hand = row.hand;
  const largeText = useWindowDimensions().fontScale > 1.3;
  const { word, folded, score, net } = handResult(hand);
  return (
    <LedgerCard
      testID={`history-hand-${hand.handNo}`}
      size="row"
      accessibilityLabel={handRowLabel(hand)}
      onPress={open}
    >
      <View style={[styles.row, largeText && styles.largeRow]}>
        <View style={[styles.when, largeText && styles.largeWhen]}>
          <Text style={styles.number}>{`#${hand.handNo}`}</Text>
          <Text style={styles.small}>{clock(hand.startedAtMs)}</Text>
        </View>
        {/* Keep the standard game tiles readable; longer words wrap beside the result. */}
        <View style={[styles.word, word && !folded && styles.felt]}>
          {word && !folded ? (
            historyWordTiles(hand, hand.heroId).map((tile, i) => isLetter(tile.letter) ? (
              <MiniTile key={i} letter={tile.letter} multiplier={tile.multiplier} size="sm" />
            ) : null)
          ) : (
            <Text style={styles.folded}>{folded ? "FOLDED" : "NO WORD"}</Text>
          )}
        </View>
        <View style={styles.result}>
          <Text style={[styles.net, { color: chipColor(net, "card") }]}>
            {signedChips(net)}
          </Text>
          <Text style={styles.small}>
            {word && !folded ? `${score} pts` : "no word"}
          </Text>
        </View>
      </View>
    </LedgerCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 6,
  },
  heading: { flex: 1, gap: 3 },
  name: {
    fontFamily: fonts.arcade,
    fontSize: 20,
    lineHeight: 21,
    color: ledger.onFelt,
  },
  meta: {
    fontFamily: fonts.rubikMedium,
    fontSize: 11.5,
    color: ledger.onFeltDim,
  },
  empty: { fontFamily: fonts.rubikMedium, fontSize: 13, color: ledger.onFelt },
  gap: { paddingBottom: 8 },
  row: { minHeight: 54, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  when: { width: 46, gap: 2 },
  largeRow: { flexWrap: "wrap" },
  largeWhen: { width: "100%" },
  number: { fontFamily: fonts.arcade, fontSize: 15, color: ledger.ink },
  small: { fontFamily: fonts.rubikMedium, fontSize: 10, color: ledger.inkSoft },
  word: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  felt: {
    paddingHorizontal: 6,
    paddingBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ledger.modeTileEdge,
    backgroundColor: ledger.modeTile,
  },
  folded: {
    fontFamily: fonts.arcade,
    fontSize: 13,
    letterSpacing: 0.78,
    color: ledger.inkMuted,
  },
  result: { alignItems: "flex-end", gap: 2 },
  net: { fontFamily: fonts.arcade, fontSize: 16, color: ledger.ink },
});
