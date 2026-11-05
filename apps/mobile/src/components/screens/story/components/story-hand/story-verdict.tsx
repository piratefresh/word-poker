import { useEffect, useState, type ReactElement } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { Tile } from "@wordpoker/contracts";
import type { RecordedHand } from "@wordpoker/game-rules";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import type { ResultsSeat } from "@/components/screens/results/results-types";
import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import { KITCHEN_TABLE, type MapNode } from "@/features/story/kitchen-table-map";

import { gradient, ink, lilita } from "../chapter-map/chapter-map-ink";
import { StoryDraft } from "./story-draft";
import { StoryReveal, type StoryRevealProps } from "./story-reveal";
import { StoryStage } from "./story-stage";
import { StoryWord } from "./story-word";

/** The word the player had built when the hand ended. */
export interface BuiltWord {
  word: string;
  score: number;
  tiles: readonly Tile[];
}

export interface StoryVerdictProps {
  chapterId: string;
  node: MapNode;
  verdict: RecordedHand;
  hero: ResultsSeat | null;
  winner: ResultsSeat | null;
  /** The best word the player's tiles held, for the coach to name after a loss. */
  teach: StoryRevealProps["teach"];
  /** What the player had built, for a win by fold that submitted no word. */
  built: BuiltWord | null;
  /** What a power from the draft is for: `Hand 2`. */
  into: string;
  /** The coach's hint about the boss's tell, shown after two boss losses in a row. */
  hint: string | null;
  onReplay: () => void;
  onLeave: () => void;
}

/** One star every beat, so the goals read against the stars the hand earned. */
function useFilledStars(total: number): number {
  const reduce = useReduceMotion();
  const [filled, setFilled] = useState(reduce ? total : 0);
  useEffect(() => {
    if (filled >= total) return;
    const timer = setTimeout(() => setFilled(filled + 1), 450);
    return () => clearTimeout(timer);
  }, [filled, total]);
  return filled;
}

/** The run's verdict on a settled hand: a loss is revealed and dealt again; a win fills its stars and pays a power. */
export function StoryVerdict(props: StoryVerdictProps): ReactElement {
  const { node, verdict, hero, winner, teach, onReplay, onLeave } = props;
  const won = hero?.takesPot ?? false;
  if (!won) {
    return <StoryReveal hero={hero} hint={verdict.coachHint ? (props.hint ?? undefined) : undefined} node={node} onLeave={onLeave} onReplay={onReplay} teach={teach} winner={winner} />;
  }
  return <StoryResult {...props} />;
}

function StoryResult({ chapterId, node, verdict, hero, built, into, hint, onReplay, onLeave }: StoryVerdictProps): ReactElement {
  // The draft waits in the save, so it survives leaving here; taking one settles it and goes back.
  const { draft } = verdict;
  const filled = useFilledStars(verdict.replayBoss ? 0 : verdict.stars);
  const title = verdict.bossBeaten ? `${KITCHEN_TABLE.boss.toUpperCase()} BEATEN` : verdict.replayBoss ? "NOT THIS TIME" : `${node.title.toUpperCase()} · WON`;
  const chips = hero?.net ?? 0;
  // A fold-out submits no word: show the one the player had built, if it was a real word.
  const folded = hero?.word == null;
  const shown = hero?.word != null ? { word: hero.word, score: hero.total, tiles: hero.tiles } : built;

  return (
    <StoryStage dim={0.45} room={node.room}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, gradient("radial-gradient(ellipse at 50% 0%, #2f4a3c, #18231e 70%)")]} testID="story-verdict">
          <Text style={styles.kicker}>{title}</Text>
          {verdict.replayBoss ? null : (
            <Text accessibilityLabel={`${verdict.stars} of 3 stars`} style={styles.stars}>
              {[1, 2, 3].map((star) => (
                <Text key={star} style={star <= filled ? styles.starOn : styles.starOff}>
                  ★
                </Text>
              ))}
            </Text>
          )}
          {shown === null ? null : <StoryWord tiles={shown.tiles} />}
          {shown === null ? null : (
            <Text style={styles.result}>
              {`${shown.word} · ${shown.score} PTS`}
              {chips > 0 ? <Text style={styles.chips}>{`  +${chips}`}</Text> : null}
            </Text>
          )}
          {folded ? <Text style={styles.folded}>{`${node.opponent} folded`}</Text> : null}
          {verdict.coachHint && hint !== null ? <Text style={styles.hint}>{hint}</Text> : null}
          <View style={styles.rule} />
          {draft !== null ? (
            <StoryDraft chapterId={chapterId} into={into} offers={draft} onSettled={onLeave} />
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
    </StoryStage>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 40 },
  card: { alignItems: "center", alignSelf: "center", borderColor: "#6b3416", borderRadius: 26, borderWidth: 6, boxShadow: "0px 0px 0px 2px #b8703a, 0px 20px 40px rgba(0,0,0,0.6)", gap: 12, maxWidth: 420, paddingHorizontal: 18, paddingVertical: 24, width: "100%" },
  kicker: { color: "#f7d77a", fontFamily: lilita, fontSize: 13, letterSpacing: 1.5 },
  stars: { fontFamily: fonts.rubikMedium, fontSize: 48 },
  starOn: { color: ink.gold, textShadowColor: "#8a4e10", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  starOff: { color: "rgba(255,246,226,0.45)" },
  result: { color: ink.parchment, fontFamily: lilita, fontSize: 20 },
  folded: { color: "#b9c3b4", fontFamily: fonts.rubikMedium, fontSize: 13 },
  chips: { color: ink.gold },
  hint: { color: ink.cream, fontFamily: fonts.rubikSemiBold, fontSize: 15, textAlign: "center" },
  rule: { backgroundColor: "rgba(247,231,181,0.14)", height: 2, marginVertical: 4, width: "100%" },
});
