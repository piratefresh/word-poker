import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { POWER_UPS, type PowerUpId } from "@wordpoker/contracts";
import { STORY_RULES, chapterRecord, pickDraft, skipDraft } from "@wordpoker/game-rules";

import { PowerCard, powerCardLabel } from "@/components/powers";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, spacing } from "@/constants/theme";
import { saveStoryProgress, storyProgress } from "@/features/story/story-progress";

export interface StoryDraftProps {
  chapterId: string;
  offers: readonly PowerUpId[];
  onSettled: () => void;
}

/** The power draft after a hand: pick one, or with a full hand pick one and then the one it replaces. */
export function StoryDraft({ chapterId, offers, onSettled }: StoryDraftProps): ReactElement {
  const [replacing, setReplacing] = useState<PowerUpId | null>(null);
  const held = chapterRecord(storyProgress(), chapterId).powers;
  const full = held.length >= STORY_RULES.heldPowerCap;

  const pick = (id: PowerUpId) => {
    if (full && replacing === null) {
      setReplacing(id);
      return;
    }
    saveStoryProgress(pickDraft(storyProgress(), chapterId, replacing ?? id, replacing === null ? undefined : id));
    setReplacing(null);
    onSettled();
  };
  const skip = () => {
    saveStoryProgress(skipDraft(storyProgress(), chapterId));
    onSettled();
  };

  return (
    <View style={styles.draft} testID="story-draft">
      <Text style={styles.kicker}>
        {replacing === null ? (full ? "PICK A POWER, THEN ONE TO SWAP OUT" : "PICK A POWER") : `SWAP OUT WHICH FOR ${POWER_UPS[replacing].title.toUpperCase()}?`}
      </Text>
      <View style={styles.offers}>
        {(replacing === null ? offers : held).map((id, index) => (
          <Pressable
            accessibilityLabel={powerCardLabel(id)}
            accessibilityRole="button"
            key={`${id}-${index}`}
            onPress={() => pick(id)}
            testID={`story-draft-${id}`}
          >
            <PowerCard id={id} width={88} />
          </Pressable>
        ))}
      </View>
      <GameButton label={replacing === null ? "SKIP" : "KEEP MINE"} onPress={replacing === null ? skip : () => setReplacing(null)} variant="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  draft: { gap: spacing.sm, marginTop: spacing.sm },
  kicker: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 16, textAlign: "center" },
  offers: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
});
