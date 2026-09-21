import type { WordRejectionReason, WordScore } from "@wordpoker/contracts";
import type { JSX } from "react";
import { Text, View } from "react-native";

import { WORD_REJECTION_COPY } from "@/lib/word-rejection-copy";

import { styles } from "./styles";

/**
 * The word the seat has built and what §7 says it is worth, as one line — the strip below the
 * tiles is where the work happens, so the draft only has to be legible, not large.
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
}: {
  /** The letters the draft spells, uppercase; "" when nothing is played. */
  word: string;
  /** §7's score for the draft as it stands, or null while it does not spell a word yet. */
  score: WordScore | null;
  /** Why the draft cannot stand as a word (§11's reason), or null while it can. */
  reason: WordRejectionReason | null;
}): JSX.Element {
  const refused = reason !== null;

  return (
    <>
      {word.length === 0 ? null : (
        <View style={styles.preview}>
          <Text style={styles.word} testID="word-builder-word">
            {word}
          </Text>
          {score === null ? null : (
            <Text
              accessibilityLabel={`${score.total} points`}
              style={[styles.score, refused && styles.scoreRefused]}
              testID="word-builder-score"
            >
              {"· "}
              {score.total}
              {"pts"}
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
        </View>
      )}

      {reason === null ? null : (
        <Text accessibilityRole="alert" style={styles.reason} testID="word-builder-reason">
          {WORD_REJECTION_COPY[reason]}
        </Text>
      )}
    </>
  );
}
