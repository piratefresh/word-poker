import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Letter } from "@wordpoker/game-rules";

import { DealIn } from "@/components/screens/history/ledger/deal-in";
import { FeltPanel } from "@/components/screens/history/ledger/felt-panel";
import { GoldBackButton } from "@/components/screens/history/ledger/gold-back-button";
import { LedgerCard } from "@/components/screens/history/ledger/ledger-card";
import { LedgerPage } from "@/components/screens/history/ledger/ledger-page";
import { colors, fontSize, fonts, gradients } from "@/constants/theme";
import { chipColor, signedChips } from "@/utils/chips";
import { clock, clockSeconds, dayLabel } from "@/utils/date";
import { MiniTile } from "@/components/screens/history/ledger/mini-tile";
import { SourcePill } from "@/components/screens/history/ledger/source-pill";
import { StatusPill, type StatusVariant } from "@/components/screens/history/ledger/status-pill";
import { UnrankedLabel } from "@/components/screens/history/ledger/unranked-label";

const STATUSES: StatusVariant[] = ["synced", "onDevice", "uploading", "verified", "rejected"];
const WORD: Letter[] = ["L", "E", "D", "G", "E", "R"];

export default function DevLedger() {
  return __DEV__ ? <LedgerGallery /> : null;
}

function LedgerGallery() {
  const [status, setStatus] = useState(0);
  const [entrance, setEntrance] = useState(0);
  const [stress, setStress] = useState(false);
  const now = new Date();
  return (
    <LedgerPage>
      <LedgerCard>
        <Text accessibilityRole="header" style={styles.title}>The Hand Ledger</Text>
        <Text style={styles.body}>STO-631 · Materials and components</Text>
        <View style={styles.row}>
          <GoldBackButton accessibilityLabel="Back to sessions" onPress={() => setEntrance(entrance + 1)} />
          <GoldBackButton accessibilityLabel="Back to hands" onPress={() => setEntrance(entrance + 1)} />
          <UnrankedLabel />
        </View>
        <Text style={styles.body}>{dayLabel(now)} · {clock(now)} · {clockSeconds(now)}</Text>
      </LedgerCard>
      <LedgerCard>
        <Text style={styles.cardTitle}>Multiplier tiles</Text>
        <FeltPanel style={styles.tileWell}>
        {(["lg", "md", "sm"] as const).map((size) => <View key={size} style={styles.row}>
          <MiniTile letter="A" size={size} />
          <MiniTile letter="A" size={size} multiplier="double-letter" />
          <MiniTile letter="A" size={size} multiplier="triple-letter" />
        </View>)}
        </FeltPanel>
      </LedgerCard>
      {(["default", "winner", "muted"] as const).map((tone, index) => (
        <DealIn key={`${entrance}-${tone}`} index={index}>
          <LedgerCard tone={tone}>
            <Text style={styles.cardTitle}>{tone === "default" ? "Classic · Online" : tone === "winner" ? "Winning hand" : "Folded opponent"}</Text>
            <Text style={styles.body}>Cream card · {tone}</Text>
            <View style={styles.row}>{STATUSES.map((variant) => <StatusPill key={variant} variant={variant} />)}</View>
            <View style={styles.row}>{(["player", "bot", "timeout"] as const).map((source) => <SourcePill key={source} source={source} />)}</View>
            <FeltPanel style={styles.tileWell}>
            {(["lg", "md", "sm"] as const).map((size) => <View key={size} style={styles.row}>
              {(["cream", "dim", "gold"] as const).map((tileTone) => <MiniTile key={tileTone} letter="Q" size={size} tone={tileTone} />)}
              <MiniTile letter="A" size={size} opacity={.55} />
            </View>)}
            <View style={styles.row}>{WORD.map((letter, i) => <MiniTile key={i} letter={letter} size="sm" />)}</View>
            </FeltPanel>
          </LedgerCard>
        </DealIn>
      ))}
      <LedgerCard onPress={() => setStatus((status + 1) % STATUSES.length)} accessibilityLabel="Cycle sync status">
        <Text style={styles.cardTitle}>Press to change status</Text>
        <StatusPill variant={STATUSES[status]} />
        <StatusPill variant="verified" text="CUSTOM BADGE" />
      </LedgerCard>
      <LedgerCard size="row">
        <Text style={styles.cardTitle}>Hand #12</Text>
        <View style={styles.row}>{[1050, -40, 0].map((value) => <Text key={value} style={[styles.number, { color: chipColor(value, "card") }]}>{signedChips(value)}</Text>)}</View>
      </LedgerCard>
      <FeltPanel>
        <Text style={styles.feltLabel}>BOARD · ACTION LOG</Text>
        <Text style={styles.feltText}>9:40:12 · You called 40</Text>
        <View style={styles.row}>{[1050, -40, 0].map((value) => <Text key={value} style={[styles.number, { color: chipColor(value, "felt") }]}>{signedChips(value)}</Text>)}</View>
      </FeltPanel>
      <LedgerCard size="row" onPress={() => setStress(!stress)} accessibilityLabel={stress ? "Hide 200 cards" : "Show 200 cards"}>
        <Text style={styles.cardTitle}>{stress ? "Hide" : "Show"} 200 cards</Text>
      </LedgerCard>
      {stress && Array.from({ length: 200 }, (_, index) => <LedgerCard key={index} size="row">
        <Text style={styles.cardTitle}>Hand #{200 - index}</Text>
        <Text style={styles.body}>Scroll performance sample</Text>
      </LedgerCard>)}
    </LedgerPage>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.arcade, fontSize: 30, color: colors.onTile },
  cardTitle: { fontFamily: fonts.arcade, fontSize: 20, color: colors.onTile },
  body: { fontFamily: fonts.sans, fontSize: fontSize.small, color: colors.onTile },
  number: { fontFamily: fonts.arcade, fontSize: 20 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tileWell: { backgroundColor: gradients.table.colors[2] },
  feltLabel: { fontFamily: fonts.sansBold, fontSize: fontSize.caption, color: colors.textDim },
  feltText: { fontFamily: fonts.sans, fontSize: fontSize.body, color: colors.text },
});
