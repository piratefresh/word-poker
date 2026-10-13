/**
 * river-review.tsx — §44's River Review panel: the hero's three best words from its seven tiles,
 * shown with the hand's results. The hero's own tiles ride gold and the table's cream, by tile
 * id; the best word is lit. Private: only the holder is ever handed a review to draw.
 */

import type { RiverReviewWord, Tile as WireTile } from "@wordpoker/contracts";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Tile } from "@/components/game/word-tile";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

export interface RiverReviewProps {
  readonly words: readonly RiverReviewWord[];
  /** Every tile the hero could play: its rack and the board. */
  readonly available: readonly WireTile[];
  /** The ids of the hero's own tiles. */
  readonly mine: ReadonlySet<string>;
}

export function RiverReview({ words, available, mine }: RiverReviewProps): ReactElement {
  return (
    <View style={styles.panel} testID="river-review">
      <Text style={styles.label}>RIVER REVIEW</Text>
      {words.length === 0 ? <Text style={styles.empty}>No word was buildable.</Text> : null}
      {words.map((entry, index) => (
        <View key={entry.word} style={[styles.row, index === 0 && styles.best]} testID={`river-review-${index + 1}`}>
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={styles.tiles}>
            {entry.plays.map((play) => {
              const tile = available.find((candidate) => candidate.id === play.tileId);
              if (tile === undefined) return null;
              // A choice tile shows the face the word played, as the results' own tiles do.
              const shown =
                "alternativeLetter" in tile && play.chosenFace !== undefined
                  ? {
                      id: tile.id,
                      letter: play.chosenFace,
                      points: play.chosenFace === tile.letter ? tile.points : tile.alternativePoints,
                      multiplier: tile.multiplier,
                    }
                  : tile;
              return (
                <Tile
                  animation="none"
                  key={tile.id}
                  ownership={mine.has(tile.id) ? "private" : "community"}
                  side="front"
                  size="small"
                  tile={shown}
                />
              );
            })}
          </View>
          <Text style={styles.score}>{entry.score}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  label: { color: colors.textDim, fontFamily: fonts.mono, fontSize: fontSize.micro, letterSpacing: 2 },
  empty: { color: colors.textFaint, fontFamily: fonts.mono, fontSize: fontSize.micro },
  row: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.xs,
  },
  best: { backgroundColor: "rgba(212,165,64,0.12)", borderColor: colors.goldHi },
  rank: { color: colors.textDim, fontFamily: fonts.mono, fontSize: fontSize.micro, width: 14 },
  tiles: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  score: { color: colors.goldHi, fontFamily: fonts.mono, fontSize: fontSize.micro },
});

/** The panel's props for a hand the hero held River Review through, or `undefined` for any other. */
export function reviewOf(
  words: readonly RiverReviewWord[] | null | undefined,
  game: {
    readonly community: readonly (WireTile | null)[];
    readonly privateTiles: readonly WireTile[];
  } | null,
): RiverReviewProps | undefined {
  if (words == null || game === null) return undefined;
  const available = [...game.privateTiles, ...game.community.filter((tile) => tile !== null)];
  return { words, available, mine: new Set(game.privateTiles.map((tile) => tile.id)) };
}
