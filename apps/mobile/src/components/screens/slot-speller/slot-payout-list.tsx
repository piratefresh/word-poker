/**
 * A paid spin, checkable (STO-1183), in the round sheets' glossy look: one card per word with its
 * letters as tiles, its line, the engine's working and its score; a candy pill for each power it
 * triggered; the spin total. Every number is the engine's.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SlotEvaluation, SlotLetterScore, SlotWord } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import { powerName, workingLine, type SlotPayoutRow } from "@/features/slot-speller/slot-speller-model";

import { cellColours, lineColour } from "./slot-grid";

/** G1's cream ink and gold, as the round sheets use them. */
const CREAM_DIM = "rgba(255,246,226,0.75)";
const GOLD = "#f7df7a";
const GOLD_HI = "#fff1a0";
const COCOA = "#3d1a06";
/** The Scoring power's candy, from the shop's cards. */
const SCORING = ["#ff9ab0", "#e0476a", "#a3213f"] as const;
const SCORING_LIP = "#5a0b20";

export interface SlotPayoutListProps {
  payout: SlotEvaluation;
  /** The rows to show, in order: each word, the powers it triggered, and (when listed) the total. */
  rows: readonly SlotPayoutRow[];
  /** What each triggered Scoring power multiplied a word by. */
  powerMultiplier: number;
}

/** The paid spin, word by word: what each word scored and how, the powers it triggered, the total. */
export function SlotPayoutList({ payout, rows, powerMultiplier }: SlotPayoutListProps): ReactElement {
  return (
    <View accessibilityLiveRegion="polite" style={styles.list} testID="slot-payout">
      {rows.map((row) => {
        if (row.kind === "total") {
          return (
            <View key="total" accessibilityLabel={`Spin total, ${row.total} points`} accessible style={styles.total}>
              <Text style={styles.totalLabel}>{payout.words.length === 0 ? "NO WORDS PAID" : "SPIN TOTAL"}</Text>
              <Text style={styles.totalScore}>{`+${row.total}`}</Text>
            </View>
          );
        }
        const word = payout.words[row.index];
        if (word === undefined) return null;
        if (row.kind === "power") {
          return (
            <LinearGradient key={`${row.index}-${row.power}`} colors={SCORING} style={styles.power}>
              <Text style={styles.powerText}>{`⚡ ${powerName(row.power)} ×${powerMultiplier}`}</Text>
            </LinearGradient>
          );
        }
        return <WordCard key={`word-${row.index}`} index={row.index} word={word} powerMultiplier={powerMultiplier} />;
      })}
    </View>
  );
}

/** One paid word: a stripe in its line's colour, its tiles, its line and word cells, its working, its score. */
function WordCard({ index, word, powerMultiplier }: { index: number; word: SlotWord; powerMultiplier: number }): ReactElement {
  const colour = lineColour(word.line);
  const working = workingLine(word.breakdown, powerMultiplier);
  const { score, wordCells } = word.breakdown;
  return (
    <View
      accessibilityLabel={`${word.word}, ${word.line}, ${score} points: ${working}`}
      accessible
      style={styles.card}
      testID={`slot-payout-word-${index}`}
    >
      <View style={[styles.stripe, { backgroundColor: colour }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.tiles}>
            {word.breakdown.letters.map((letter, at) => (
              <MiniTile key={at} letter={letter} />
            ))}
          </View>
          <View style={styles.tags}>
            <Text style={[styles.tag, { backgroundColor: colour }]}>{word.line.toUpperCase()}</Text>
            {wordCells.map((multiplier, at) => {
              const { fill, ink } = cellColours({ kind: "word", multiplier });
              return <Text key={at} style={[styles.tag, { backgroundColor: fill, color: ink }]}>{`${multiplier}W`}</Text>;
            })}
          </View>
        </View>
        <Text style={styles.working} testID={`slot-working-${index}`}>
          {working}
        </Text>
      </View>
      <ScoreMedal score={score} />
    </View>
  );
}

/** A letter as a small gold tile: its points in the corner, and a badge for its letter cell or DL/TL tile. */
function MiniTile({ letter }: { letter: SlotLetterScore }): ReactElement {
  const badge =
    letter.cellMult > 1
      ? { text: `${letter.cellMult}L`, ...cellColours({ kind: "letter", multiplier: letter.cellMult }) }
      : letter.tileMult > 1
        ? { text: letter.tileMult === 3 ? "TL" : "DL", fill: "#f2c75a", ink: COCOA }
        : null;
  return (
    <View>
      <LinearGradient colors={["#fff6c8", "#f7df7a", "#e6a73e"]} style={styles.tile}>
        <Text style={styles.tileLetter}>{letter.letter}</Text>
        <Text style={styles.tilePoints}>{letter.points}</Text>
      </LinearGradient>
      {badge !== null ? <Text style={[styles.tileBadge, { backgroundColor: badge.fill, color: badge.ink }]}>{badge.text}</Text> : null}
    </View>
  );
}

/** The word's score in a gold-rimmed medal, as Run over shows the round. */
function ScoreMedal({ score }: { score: number }): ReactElement {
  return (
    <LinearGradient colors={["#fff1b0", "#e7c75a", "#c79a2e", "#7e5e16"]} style={styles.medal}>
      <LinearGradient colors={["#135a40", "#062a1e"]} style={styles.medalFace}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.medalValue}>
          {score}
        </Text>
      </LinearGradient>
    </LinearGradient>
  );
}

const shadow = (offset: number) => ({ textShadowOffset: { width: 0, height: offset }, textShadowRadius: 0.01 });

const styles = StyleSheet.create({
  list: { gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(247,223,122,0.25)",
    backgroundColor: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  cardBody: { flex: 1, gap: 6 },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  tiles: { flexDirection: "row", gap: 3, paddingTop: 4 },
  tile: { width: 26, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "#b8702a" },
  tileLetter: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 18, color: "#2b1810" },
  tilePoints: { position: "absolute", right: 2, bottom: 0, fontFamily: fonts.uiMedium, fontSize: 8, lineHeight: 10, color: "#2b1810" },
  tileBadge: {
    position: "absolute",
    top: -6,
    alignSelf: "center",
    paddingHorizontal: 3,
    borderRadius: 4,
    overflow: "hidden",
    fontFamily: fonts.ui,
    fontSize: 8,
    lineHeight: 11,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 999,
    overflow: "hidden",
    fontFamily: fonts.ui,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.5,
    color: "#10202a",
  },
  working: { fontFamily: fonts.uiMedium, fontSize: 12, lineHeight: 16, color: CREAM_DIM },
  medal: { width: 46, height: 46, borderRadius: 23, padding: 3 },
  medalFace: { flex: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  medalValue: { fontFamily: fonts.ui, fontSize: 20, lineHeight: 24, color: GOLD_HI, textShadowColor: "#000", ...shadow(2) },
  power: {
    alignSelf: "flex-start",
    marginTop: -2,
    marginLeft: 18,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    shadowColor: SCORING_LIP,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  powerText: { fontFamily: fonts.ui, fontSize: 12, color: "#ffffff", textShadowColor: SCORING_LIP, ...shadow(1) },
  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    paddingTop: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(247,223,122,0.35)",
  },
  totalLabel: { fontFamily: fonts.ui, fontSize: 14, letterSpacing: 1.5, color: GOLD },
  totalScore: { fontFamily: fonts.ui, fontSize: 26, lineHeight: 30, color: GOLD_HI, textShadowColor: "#7a4a10", ...shadow(2) },
});
