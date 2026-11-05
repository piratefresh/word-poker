import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import type { ResultsSeat } from "@/components/screens/results/results-types";
import type { MapNode } from "@/features/story/kitchen-table-map";

import { ink, lilita, gradient } from "../chapter-map/chapter-map-ink";
import { FriendAvatar } from "../chapter-map/friend-avatar";
import { StoryStage } from "./story-stage";
import { StoryWord } from "./story-word";

export interface StoryRevealProps {
  node: MapNode;
  /** Whoever took the pot, and you. */
  winner: ResultsSeat | null;
  hero: ResultsSeat | null;
  /** What the coach says about the best word the player's tiles held. */
  teach: { word: string; score: number; beats: boolean; stars: number } | null;
  /** The boss's own line after a loss, once the run has one. */
  hint?: string;
  onReplay: () => void;
  onLeave: () => void;
}

/**
 * A lost hand: both words face off, winner's on top, and then the coach shows the best word the
 * player's tiles could have made. TRY AGAIN is the way on; there is no power pick here.
 */
export function StoryReveal({ node, winner, hero, teach, hint, onReplay, onLeave }: StoryRevealProps): ReactElement {
  const line = hint ?? (teach === null ? null : teachLine(teach));
  return (
    <StoryStage room={node.room}>
      <ScrollView contentContainerStyle={styles.scroll} testID="story-verdict">
        <Text style={styles.chip}>SHOWDOWN</Text>
        {winner === null ? null : (
          <View style={styles.side}>
            <View style={styles.who}>
              {node.friend ? <FriendAvatar friend={node.friend.id} size={40} /> : null}
              <Text style={styles.name}>{winner.name.toUpperCase()}</Text>
              <Text style={styles.takes}>TAKES THE POT</Text>
            </View>
            <StoryWord tiles={winner.tiles} />
            <Text style={styles.gold}>{`${winner.word ?? "NO WORD"} · ${winner.total}`}</Text>
          </View>
        )}
        <Text style={styles.beats}>beats</Text>
        <View style={styles.side}>
          <StoryWord tiles={hero?.tiles ?? []} />
          <Text style={styles.you}>{`YOU · ${hero?.word ?? "NO WORD"} · ${hero?.total ?? 0}`}</Text>
        </View>
      </ScrollView>
      <View style={[styles.card, gradient("radial-gradient(ellipse at 50% 0%, #2f4a3c, #18231e 70%)")]}>
        <Text accessibilityLabel="0 of 3 stars" style={styles.stars}>
          ★★★
        </Text>
        <Text style={styles.heading}>So close!</Text>
        {line === null ? null : (
          <View style={styles.coach}>
            {node.friend ? <FriendAvatar friend={node.friend.id} size={38} /> : null}
            <Text style={styles.coachLine} testID="story-teach">
              {line}
            </Text>
          </View>
        )}
        <GameButton label="TRY AGAIN" onPress={onReplay} testID="story-replay" variant="gold" />
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onLeave} testID="story-back">
          <Text style={styles.link}>Back to map</Text>
        </Pressable>
      </View>
    </StoryStage>
  );
}

function teachLine({ word, score, beats, stars }: NonNullable<StoryRevealProps["teach"]>): string {
  const earned = stars > 1 ? ` and earns ${"★".repeat(stars)}` : "";
  return beats ? `${word} was in your tiles for ${score}. That beats me${earned}.` : `${word} was the best word in your tiles, for ${score}.`;
}

const styles = StyleSheet.create({
  scroll: { alignItems: "center", gap: 8, paddingBottom: 280, paddingHorizontal: 20, paddingTop: 58 },
  chip: { backgroundColor: "rgba(8,12,28,0.75)", borderColor: ink.amber, borderRadius: 999, borderWidth: 3, color: ink.cream, fontFamily: lilita, fontSize: 17, marginBottom: 28, overflow: "hidden", paddingHorizontal: 18, paddingVertical: 6 },
  side: { alignItems: "center", gap: 8 },
  who: { alignItems: "center", flexDirection: "row", gap: 8 },
  name: { color: ink.parchment, fontFamily: lilita, fontSize: 18 },
  takes: { backgroundColor: ink.gold, borderRadius: 999, color: "#4a2608", fontFamily: lilita, fontSize: 13, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 2 },
  gold: { color: ink.gold, fontFamily: lilita, fontSize: 22 },
  beats: { color: "rgba(255,246,226,0.6)", fontFamily: lilita, fontSize: 16, marginVertical: 8 },
  you: { color: ink.parchment, fontFamily: lilita, fontSize: 22 },
  card: { alignItems: "center", alignSelf: "center", borderColor: "#6b3416", borderRadius: 24, borderWidth: 5, bottom: 26, boxShadow: "0px 0px 0px 2px #b8703a, 0px 16px 30px rgba(0,0,0,0.55)", gap: 12, maxWidth: 420, padding: 18, position: "absolute", width: "94%" },
  stars: { color: "rgba(255,246,226,0.45)", fontFamily: fonts.rubikMedium, fontSize: 22 },
  heading: { color: ink.cream, fontFamily: lilita, fontSize: 24 },
  coach: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14, flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10, width: "100%" },
  coachLine: { color: "#e9e2cf", flex: 1, fontFamily: fonts.rubikMedium, fontSize: 14, lineHeight: 19 },
  link: { color: "#d6d0c2", fontFamily: fonts.rubikMedium, fontSize: 14, textDecorationLine: "underline" },
});
