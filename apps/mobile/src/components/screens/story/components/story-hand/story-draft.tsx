import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { POWER_UPS, type PowerUpId } from "@wordpoker/contracts";
import { STORY_RULES, chapterRecord, pickDraft } from "@wordpoker/game-rules";

import { PowerEmblem, powerCardLabel } from "@/components/powers";
import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import { saveStoryProgress, storyProgress } from "@/features/story/story-progress";

import { ink, lilita } from "../chapter-map/chapter-map-ink";

export interface StoryDraftProps {
  chapterId: string;
  offers: readonly PowerUpId[];
  /** What the power is for: `Hand 2`. */
  into: string;
  onSettled: () => void;
}

/**
 * The power a won hand pays: the offers share one frame, the chosen one is ringed in gold with a
 * check, and one button takes it. With a full hand the pick is followed by the one it replaces.
 */
export function StoryDraft({ chapterId, offers, into, onSettled }: StoryDraftProps): ReactElement {
  const held = chapterRecord(storyProgress(), chapterId).powers;
  const full = held.length >= STORY_RULES.heldPowerCap;
  const [chosen, setChosen] = useState<PowerUpId>(offers[0]!);
  const [replacing, setReplacing] = useState<PowerUpId | null>(null);
  const [swapping, setSwapping] = useState(false);

  const cards = swapping ? held : offers;
  const selected = swapping ? (replacing ?? held[0]!) : chosen;

  const take = () => {
    if (full && !swapping) {
      setSwapping(true);
      setReplacing(held[0]!);
      return;
    }
    saveStoryProgress(pickDraft(storyProgress(), chapterId, chosen, swapping ? (replacing ?? undefined) : undefined));
    onSettled();
  };
  const choose = (id: PowerUpId) => (swapping ? setReplacing(id) : setChosen(id));

  return (
    <View style={styles.draft} testID="story-draft">
      <Text style={styles.heading}>{swapping ? `Swap out which for ${POWER_UPS[chosen].title}?` : `Take a power into ${into}`}</Text>
      <View style={styles.cards}>
        {cards.map((id, index) => {
          const on = id === selected;
          return (
            <Pressable
              accessibilityLabel={powerCardLabel(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={`${id}-${index}`}
              onPress={() => choose(id)}
              style={[styles.card, on && styles.cardOn]}
              testID={`story-draft-${id}`}
            >
              {on ? (
                <View style={styles.check}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              ) : null}
              <PowerEmblem icon={POWER_UPS[id].icon} size={64} />
              <Text style={styles.name}>{POWER_UPS[id].title.toUpperCase()}</Text>
              <Text style={styles.text}>{POWER_UPS[id].description}</Text>
            </Pressable>
          );
        })}
      </View>
      <GameButton label={swapping ? `SWAP FOR ${POWER_UPS[chosen].title.toUpperCase()}` : `TAKE ${POWER_UPS[chosen].title.toUpperCase()}`} onPress={take} testID="story-take" variant="green" />
    </View>
  );
}

const styles = StyleSheet.create({
  draft: { gap: 12, width: "100%" },
  heading: { color: ink.cream, fontFamily: lilita, fontSize: 22, textAlign: "center" },
  cards: { flexDirection: "row", gap: 10 },
  card: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.2)", borderColor: "rgba(243,230,196,0.16)", borderRadius: 16, borderWidth: 3, flex: 1, gap: 8, minHeight: 176, paddingHorizontal: 10, paddingVertical: 12 },
  cardOn: { backgroundColor: "rgba(247,215,122,0.12)", borderColor: "#f7d77a" },
  check: { alignItems: "center", backgroundColor: "#f7d77a", borderRadius: 14, height: 28, justifyContent: "center", position: "absolute", right: -10, top: -10, width: 28, zIndex: 1 },
  checkMark: { color: "#4a2608", fontFamily: fonts.rubikSemiBold, fontSize: 16 },
  name: { color: ink.cream, fontFamily: lilita, fontSize: 17, textAlign: "center" },
  text: { color: "#d6d0c2", fontFamily: fonts.rubikMedium, fontSize: 12.5, lineHeight: 17, textAlign: "center" },
});
