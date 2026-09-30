import type {
  WordCheckResult,
  WordRejectionReason,
  WordScore,
} from "@wordpoker/contracts";
import type { JSX } from "react";
import { Text, View } from "react-native";

import { useCompactControls } from "@/components/screens/game/screen-scale";
import { WORD_REJECTION_COPY } from "@/lib/word-rejection-copy";

import { styles } from "./styles";

/**
 * The score and full rack bonus, below the word and dictionary check button.
 *
 * Nothing is scored below two letters (§12), and a draft of one tile is a letter rather than a
 * word, so the number appears only when there is a word behind the letters. A refused draft
 * still shows what it would have scored, drawn faded: the reason line under it is what says it
 * will not count.
 */
export function DraftLine({
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
  const refused = reason !== null;
  const tight = useCompactControls();

  return (
    <>
      {word.length === 0 ? null : (
        <View style={styles.preview}>
          {checkedResult === null || checkedResult === undefined ? (
            <>
              {score === null ? null : (
                <Text
                  accessibilityLabel={`${score.total} points`}
                  style={[
                    styles.score,
                    tight && styles.scoreTight,
                    refused && styles.scoreRefused,
                  ]}
                  testID="word-builder-score"
                >
                  {score.total}
                  {" pts"}
                </Text>
              )}
              {score === null || score.fullRackBonus === 0 ? null : (
                <Text style={styles.rackBonus} testID="word-builder-full-rack">
                  {"· "}
                  {"+"}
                  {score.fullRackBonus}
                  {" full rack"}
                </Text>
              )}
            </>
          ) : (
            <View
              accessibilityLabel={
                checkedResult.valid
                  ? `Valid Word, ${checkedResult.points ?? 0} points`
                  : "Not a word"
              }
              style={styles.checkedResult}
              testID="word-builder-check-result"
            >
              <Text
                accessible={false}
                style={
                  checkedResult.valid
                    ? styles.checkedValid
                    : styles.checkedInvalid
                }
              >
                {checkedResult.valid ? "✓" : "×"}
              </Text>

              {checkedResult.valid ? (
                <Text style={styles.checkedPoints}>
                  {"· "}
                  {checkedResult.points ?? 0}
                  {" pts"}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {reason === null ? null : (
        <Text
          accessibilityRole="alert"
          style={styles.reason}
          testID="word-builder-reason"
        >
          {WORD_REJECTION_COPY[reason]}
        </Text>
      )}
    </>
  );
}
