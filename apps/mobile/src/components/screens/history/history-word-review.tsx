import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { HistoryHand } from "@wordpoker/contracts";
import { loadDictionary, topWords } from "@wordpoker/game-rules";

import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, ledger } from "@/constants/theme";

import { RiverReview, type RiverReviewProps } from "../results/river-review";

export function HistoryWordReview({ hand }: { hand: HistoryHand }) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<RiverReviewProps | null>(null);
  const [error, setError] = useState(false);
  const hero = hand.summary.seats.find((seat) => seat.playerId === hand.heroId);
  if (!hero || hero.word || hero.privateTiles.length === 0 || hand.summary.community.length !== 5) return null;

  const show = async () => {
    setOpen(true);
    setError(false);
    if (review) return;
    try {
      const dictionary = await loadDictionary(hand.dictionaryId);
      const available = [...hero.privateTiles, ...hand.summary.community];
      const words = topWords({ available, dictionary }, 3).map(({ word, score, submission }) => ({
        word, score, plays: submission.plays,
      }));
      setReview({ words, available, mine: new Set(hero.privateTiles.map((tile) => tile.id)) });
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={show} style={styles.trigger}>
        <Text style={styles.link}>See 3 possible words</Text>
      </Pressable>
      <Modal supportedOrientations={MODAL_ORIENTATIONS} animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text accessibilityRole="header" style={styles.title}>WORDS YOU COULD HAVE PLAYED</Text>
              {review ? <RiverReview {...review} /> : (
                <Text accessibilityRole={error ? "alert" : undefined} style={styles.message}>
                  {error ? "Could not load possible words. Please try again." : "Finding possible words…"}
                </Text>
              )}
              {error ? <GameButton label="TRY AGAIN" onPress={show} /> : null}
              <GameButton label="CLOSE" onPress={() => setOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 44, justifyContent: "center" },
  link: { color: ledger.goldText, fontFamily: fonts.rubikSemiBold, fontSize: 12, textDecorationLine: "underline" },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.75)" },
  dialog: { width: "100%", maxWidth: 440, maxHeight: "85%", backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  content: { padding: 16, gap: 16 },
  title: { color: colors.text, fontFamily: fonts.arcade, fontSize: 20 },
  message: { color: colors.textDim, fontFamily: fonts.rubikMedium, fontSize: 13 },
});
