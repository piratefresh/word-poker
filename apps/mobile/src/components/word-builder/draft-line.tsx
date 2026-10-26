import type {
  WordCheckResult,
  WordRejectionReason,
  WordScore,
} from "@wordpoker/contracts";
import { useState, type JSX } from "react";
import { Pressable, Text, View } from "react-native";

import { WORD_REJECTION_COPY } from "@/features/table/word-rejection-copy";

import { styles } from "./styles";

/**
 * The draft as a plate: the word's letters as small tiles, an "=", and the coin it is worth.
 *
 * A word §11 refuses, or a dictionary check that says "not a word", counts for nothing: the
 * tiles go muted under a strike line, the "=" dims and the coin shows a dash — no text. The
 * reason still reaches assistive tech as an alert, drawn out of sight.
 */
export function DraftPlate({
  word,
  score,
  reason,
  checkedResult,
}: {
  /** The letters the draft spells, uppercase; "" when nothing is played. */
  word: string;
  /** §7's score for the draft as it stands, or null while it does not spell a word yet. */
  score: WordScore | null;
  /** Why the draft cannot stand as a word (§11's reason), or null while it can. */
  reason: WordRejectionReason | null;
  /** The latest private dictionary check, shown only while it matches this exact draft. */
  checkedResult?: WordCheckResult | null;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const checked = checkedResult ?? null;
  const refused = reason !== null || checked?.valid === false;
  const points = checked?.valid ? (checked.points ?? 0) : score?.total ?? null;
  const multiplier = refused ? undefined : bestMultiplier(score);

  return (
    <>
      <View
        accessible
        accessibilityLabel={
          refused
            ? `${word}, not a word`
            : points === null
              ? word
              : `${word}, ${points} points`
        }
        style={styles.plate}
        testID="word-preview"
      >
        <View style={styles.plateTiles}>
          <Text style={[styles.plateWord, refused && styles.plateDim]}>{word}</Text>
          {refused ? <View style={styles.plateStrike} /> : null}
        </View>
        {checked?.valid === false ? (
          <Text style={styles.notAWord} testID="word-builder-not-a-word">Not a word</Text>
        ) : (
        <>
        <Text style={[styles.plateEquals, refused && styles.plateDim]}>=</Text>
        <Pressable
          accessibilityLabel={refused || points === null ? undefined : `${points} points, tap for the breakdown`}
          onHoverIn={() => setOpen(true)}
          onHoverOut={() => setOpen(false)}
          onPress={() => setOpen((was) => !was)}
          style={[styles.coin, refused && styles.coinDim]}
        >
          <Text
            style={[styles.coinText, refused && styles.plateDim]}
            testID="word-builder-score"
          >
            {refused || points === null ? "–" : points}
          </Text>
          {multiplier === undefined ? null : (
            <Text style={styles.coinTag}>{multiplier}</Text>
          )}
          {open && !refused && score !== null ? (
            <View style={styles.breakdown} testID="word-builder-breakdown">
              {score.letters.map((letter, at) => (
                <View key={at} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{letter.letter}</Text>
                  <Text
                    style={[
                      styles.breakdownValue,
                      letter.multiplier !== undefined && styles.breakdownGold,
                    ]}
                  >
                    {letter.multiplier === undefined ? "" : `${letter.multiplier === "triple-letter" ? "3×" : "2×"}  `}
                    +{letter.value}
                  </Text>
                </View>
              ))}
              {score.fullRackBonus === 0 ? null : (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, styles.breakdownGold]}>
                    Full rack
                  </Text>
                  <Text style={[styles.breakdownValue, styles.breakdownGold]}>
                    +{score.fullRackBonus}
                  </Text>
                </View>
              )}
              <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                <Text style={[styles.breakdownLabel, styles.breakdownGold]}>
                  Total
                </Text>
                <Text style={[styles.breakdownValue, styles.breakdownGold]}>
                  {score.total}
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>
        {checked?.valid ? (
          <Text style={styles.validWord} testID="word-builder-valid">✓ Valid</Text>
        ) : null}
        </>
        )}
        {/* Out of sight, for the label and the tests: the tiles above read as one word. */}
        <Text style={styles.checkLiveRegion} testID="word-builder-word">
          {word}
        </Text>
      </View>

      {reason === null ? null : (
        <Text
          accessibilityRole="alert"
          style={styles.checkLiveRegion}
          testID="word-builder-reason"
        >
          {WORD_REJECTION_COPY[reason]}
        </Text>
      )}
    </>
  );
}

/** The biggest tile multiplier the word plays, as the coin's tag; none when no tile has one. */
function bestMultiplier(score: WordScore | null): string | undefined {
  const kinds = score?.letters.map((letter) => letter.multiplier) ?? [];
  if (kinds.includes("triple-letter")) return "3×";
  return kinds.includes("double-letter") ? "2×" : undefined;
}
