/**
 * chapter-map-screen.tsx — a story chapter's map (STO-861 v3, STO-1120): the chapter's art
 * scrolled bottom to top, with the letter-tile path, the nodes, the coach bubble, the next
 * chapter's doorway, and the campaign's badge shelf drawn over it from the chapter's map data
 * (`features/story/chapter-maps.ts`). A chapter without art yet is its tint.
 *
 * The map is laid out in the art's 390-wide frame and scaled to the screen as one layer, so node
 * positions stay the spec's numbers. The pieces drawn on it live in `./components/chapter-map`.
 */

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useRef, useState, type ReactElement } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MAP_WIDTH,
  bossBeaten,
  chapterStars,
  coachFor,
  maxStars,
  nodeState,
  pathTiles,
  type ChapterMap,
  type ChapterProgress,
  type MapNode,
} from "@/features/story/chapter-map";
import { chapterBadges, type StoryBadge } from "@/features/story/story-badges";

import { BadgeShelf } from "./components/chapter-map/badge-shelf";
import { BriefSheet } from "./components/chapter-map/brief-sheet";
import { ChapterMapHeader } from "./components/chapter-map/chapter-map-header";
import { ink } from "./components/chapter-map/chapter-map-ink";
import { CoachBubble } from "./components/chapter-map/coach-bubble";
import { MapFriends } from "./components/chapter-map/map-friends";
import { MapNodeButton } from "./components/chapter-map/map-node-button";
import { NextChapterDoor } from "./components/chapter-map/next-chapter-door";
import { PathTile } from "./components/chapter-map/path-tile";

/** Past a phone's width the map stops growing and sits centred on the night sky. */
const MAX_MAP_WIDTH = 480;
/** The spec opens with the next node about 520 of 844 points down the screen. */
const FOCUS_FROM_TOP = 520 / 844;

export interface ChapterMapScreenProps {
  map: ChapterMap;
  progress: ChapterProgress;
  /** Every badge of the campaign, as the save has them. */
  badges: readonly StoryBadge[];
  onPlay: (node: MapNode) => void;
  onBack: () => void;
  /** Opens the next chapter; absent on the last. */
  onNextChapter?: () => void;
}

export function ChapterMapScreen({ map, progress, badges, onPlay, onBack, onNextChapter }: ChapterMapScreenProps): ReactElement {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = Math.min(width, MAX_MAP_WIDTH) / MAP_WIDTH;
  const coach = coachFor(map, progress);
  const tiles = useMemo(() => pathTiles(map, progress), [map, progress]);
  const won = bossBeaten(map, progress);
  // This chapter's badges go by the progress on screen, so a preview fills its own slot.
  const own = chapterBadges(map, won);
  const shelf = badges.map((badge) => own.find((mine) => mine.id === badge.id) ?? badge);
  // PLAY opens the brief; DEAL on it is what starts the hand.
  const [briefing, setBriefing] = useState<MapNode | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const focusY = Math.max(0, Math.min(map.height * scale - height, coach.node.y * scale - height * FOCUS_FROM_TOP));
  const focused = useRef(false);
  const focusNextNode = () => {
    if (focused.current) return;
    focused.current = true;
    scrollRef.current?.scrollTo({ y: focusY, animated: false });
  };

  return (
    <View style={styles.screen} testID="story-map">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={focusNextNode}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: MAP_WIDTH * scale, height: map.height * scale, overflow: "hidden" }}>
          <View style={[styles.map, { height: map.height, transform: [{ scale }], transformOrigin: [0, 0, 0] }]}>
            {map.art === null ? (
              <LinearGradient colors={map.tint} style={StyleSheet.absoluteFill} testID="story-map-placeholder" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: map.tint[0] }]}>
                <Image source={map.art} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
              </View>
            )}
            {map.door === undefined ? null : <NextChapterDoor map={map} open={won} onEnter={onNextChapter} />}
            {tiles.map((tile, index) => (
              <PathTile key={index} tile={tile} />
            ))}
            <MapFriends coach={coach} map={map} />
            {map.nodes.map((node) => (
              <MapNodeButton key={node.id} node={node} state={nodeState(map, node, progress)} stars={progress[node.id] ?? 0} threshold={map.chapter.threshold} onPress={setBriefing} />
            ))}
            <CoachBubble coach={coach} />
          </View>
        </View>
      </ScrollView>

      <ChapterMapHeader map={map} stars={chapterStars(progress)} maxStars={maxStars(map)} topInset={insets.top} onBack={onBack} />
      <BadgeShelf badges={shelf} bottom={insets.bottom + 24} />
      {briefing === null ? null : (
        <BriefSheet
          map={map}
          node={briefing}
          onDeal={() => {
            setBriefing(null);
            onPlay(briefing);
          }}
          onDismiss={() => setBriefing(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink.night },
  scrollContent: { alignItems: "center" },
  map: { width: MAP_WIDTH },
});
