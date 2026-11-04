import { useState, type ReactElement } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { STORY_RULES, type RecordedHand } from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { border, colors, fonts, palette, radius, spacing } from "@/constants/theme";
import { KITCHEN_TABLE, type MapNode } from "@/features/story/kitchen-table-map";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";

import { StoryDraft } from "./story-draft";

export interface StoryVerdictProps {
  chapterId: string;
  node: MapNode;
  threshold: number;
  verdict: RecordedHand;
  word: string | null;
  score: number;
  onReplay: () => void;
  onLeave: () => void;
}

/** The run's verdict on a settled hand: stars, the draft it opens, or a lost boss hand to deal again. */
export function StoryVerdict({ chapterId, node, threshold, verdict, word, score, onReplay, onLeave }: StoryVerdictProps): ReactElement {
  // The draft waits in the save, so it survives leaving here; picking settles it.
  const [draft, setDraft] = useState(verdict.draft);

  const title = verdict.bossBeaten ? `${KITCHEN_TABLE.boss.toUpperCase()} BEATEN` : verdict.replayBoss ? "NOT THIS TIME" : node.title.toUpperCase();

  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} animationType="fade" transparent visible>
      <ScrollView contentContainerStyle={styles.backdrop}>
        <View style={styles.card} testID="story-verdict">
          <Text style={styles.kicker}>{title}</Text>
          {verdict.replayBoss ? null : (
            <Text accessibilityLabel={`${verdict.stars} of 3 stars`} style={styles.stars}>
              {"★".repeat(verdict.stars) + "☆".repeat(3 - verdict.stars)}
            </Text>
          )}
          <Text style={styles.result}>{`${word ?? "No word"} · ${score} PTS`}</Text>
          <Text style={styles.goal}>
            {node.kind === "boss"
              ? `Take the pot with ${threshold}+ points`
              : `★ win · ★★ ${threshold}+ · ★★★ ${Math.ceil(threshold * (1 + STORY_RULES.threeStarMargin))}+`}
          </Text>
          {verdict.coachHint ? <Text style={styles.hint}>{KITCHEN_TABLE.bossHint}</Text> : null}

          {draft !== null ? (
            <StoryDraft chapterId={chapterId} offers={draft} onSettled={() => setDraft(null)} />
          ) : verdict.replayBoss ? (
            <>
              <GameButton label="PLAY AGAIN" onPress={onReplay} testID="story-replay" variant="gold" />
              <GameButton label="MAP" onPress={onLeave} variant="dark" />
            </>
          ) : (
            <GameButton label="BACK TO MAP" onPress={onLeave} testID="story-back" variant="gold" />
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(2,12,9,0.78)", flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  card: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    maxWidth: 340,
    padding: spacing.md,
    width: "100%",
  },
  kicker: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 16, textAlign: "center" },
  stars: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 32, textAlign: "center" },
  result: { color: colors.textBright, fontFamily: fonts.mono, fontSize: 13, textAlign: "center" },
  goal: { color: colors.gold, fontFamily: fonts.mono, fontSize: 11, textAlign: "center" },
  hint: { color: colors.textBright, fontFamily: fonts.serifBold, fontSize: 15, textAlign: "center" },
});
