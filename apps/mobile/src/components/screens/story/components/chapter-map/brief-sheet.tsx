import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { nodeStarGoals, storyChapter, storyNode } from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import { KITCHEN_TABLE, type MapNode } from "@/features/story/kitchen-table-map";

import { gradient, ink, lilita } from "./chapter-map-ink";
import { FriendAvatar } from "./friend-avatar";

const CHAPTER = storyChapter("kitchen-table");

export interface BriefSheetProps {
  node: MapNode;
  onDeal: () => void;
  onDismiss: () => void;
}

/** The three star goals of a node, read off the chapter's own rules. */
export function starGoals(node: MapNode): { stars: number; label: string }[] {
  const { two, three } = nodeStarGoals(CHAPTER, storyNode(CHAPTER, node.id));
  return [
    { stars: 1, label: "Win the hand" },
    { stars: 2, label: `Score ${two}+` },
    { stars: 3, label: `Score ${three}+` },
  ];
}

/**
 * What a map node asks before the deal: who sits across, the goal as three stars, and what is at
 * stake (nothing). It opens over the map when PLAY is tapped, and DEAL is what starts the hand.
 */
export function BriefSheet({ node, onDeal, onDismiss }: BriefSheetProps): ReactElement {
  const number = KITCHEN_TABLE.nodes.filter((entry) => entry.kind === "hand").indexOf(node) + 1;
  const kicker = node.kind === "hand" ? `HAND ${number} · VS ${node.opponent.toUpperCase()}` : `VS ${node.opponent.toUpperCase()}`;
  return (
    <View style={styles.layer} testID="story-brief">
      <Pressable accessibilityLabel="Not now" onPress={onDismiss} style={styles.scrim} />
      <View style={styles.sheet}>
        <View style={styles.avatar}>
          {node.friend ? (
            <FriendAvatar friend={node.friend.id} size={84} />
          ) : (
            <View style={styles.bossAvatar}>
              <Text style={styles.bossInitial}>{node.glyph}</Text>
            </View>
          )}
        </View>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{node.title}</Text>
        <Text style={styles.opener}>{`“${node.opener}”`}</Text>
        <View style={styles.goals}>
          {starGoals(node).map((goal) => (
            <View accessibilityLabel={`${goal.stars} stars: ${goal.label}`} key={goal.stars} style={styles.goal} testID={`story-goal-${goal.stars}`}>
              <Text style={styles.stars}>
                {"★".repeat(goal.stars)}
                <Text style={styles.starsOff}>{"★".repeat(3 - goal.stars)}</Text>
              </Text>
              <Text style={styles.goalLabel}>{goal.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.stakes}>No clock · Practice chips · Retry free</Text>
        <GameButton
          label="DEAL"
          labelStyle={styles.dealLabel}
          onPress={onDeal}
          style={styles.deal}
          testID="story-deal"
          variant="green"
        />
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onDismiss} testID="story-not-now">
          <Text style={styles.notNow}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", zIndex: 20 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,8,24,0.62)" },
  sheet: {
    alignItems: "center",
    alignSelf: "center",
    borderColor: "#6b3416",
    borderRadius: 26,
    borderWidth: 6,
    boxShadow: "0px 0px 0px 2px #b8703a, 0px 20px 40px rgba(0,0,0,0.6)",
    gap: 12,
    marginBottom: 26,
    maxWidth: 420,
    paddingBottom: 18,
    paddingHorizontal: 20,
    paddingTop: 56,
    width: "94%",
    ...gradient("radial-gradient(ellipse at 50% 0%, #2f4a3c, #18231e 70%)"),
  },
  avatar: { left: 0, position: "absolute", right: 0, top: -42, alignItems: "center" },
  bossAvatar: { alignItems: "center", backgroundColor: ink.plum, borderColor: ink.parchment, borderRadius: 42, borderWidth: 3, height: 84, justifyContent: "center", width: 84 },
  bossInitial: { color: ink.cream, fontFamily: lilita, fontSize: 40 },
  kicker: { color: "#f7d77a", fontFamily: lilita, fontSize: 12, letterSpacing: 1.4 },
  title: { color: ink.cream, fontFamily: lilita, fontSize: 32, lineHeight: 34 },
  opener: { color: "#d6d0c2", fontFamily: fonts.rubikMedium, fontSize: 15, lineHeight: 21, textAlign: "center" },
  goals: { flexDirection: "row", gap: 8, width: "100%" },
  goal: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.25)", borderColor: "rgba(247,231,181,0.18)", borderRadius: 14, borderWidth: 2, flex: 1, gap: 6, paddingVertical: 10 },
  stars: { color: ink.gold, fontFamily: fonts.rubikMedium, fontSize: 20 },
  starsOff: { color: "rgba(255,246,226,0.45)" },
  goalLabel: { color: ink.cream, fontFamily: lilita, fontSize: 15 },
  stakes: { color: "#b9c3b4", fontFamily: fonts.rubikMedium, fontSize: 12 },
  deal: { height: 58, width: "100%" },
  dealLabel: { fontFamily: lilita, fontSize: 24, letterSpacing: 1 },
  notNow: { color: "#d6d0c2", fontFamily: fonts.rubikMedium, fontSize: 14, textDecorationLine: "underline" },
});
