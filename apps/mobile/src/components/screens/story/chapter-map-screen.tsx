/**
 * chapter-map-screen.tsx — Story mode's Chapter 1 map (STO-861 v3): the hand-inked house scrolled
 * bottom to top, with the letter-tile path, the five nodes, the coach bubble, the Chapter 2
 * doorway, and the badge shelf drawn over the art from `kitchen-table-map.ts`.
 *
 * The map is laid out in the art's 390-wide frame and scaled to the screen as one layer, so node
 * positions stay the spec's numbers. The pieces drawn on it live in `./components/chapter-map`.
 */

import { Image } from "expo-image";
import { useMemo, useRef, type ReactElement } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  KITCHEN_TABLE,
  MAP_HEIGHT,
  MAP_WIDTH,
  bossBeaten,
  chapterStars,
  coachFor,
  nodeState,
  pathTiles,
  type ChapterProgress,
  type MapNode,
} from "@/features/story/kitchen-table-map";

import { BadgeShelf } from "./components/chapter-map/badge-shelf";
import { ChapterMapHeader } from "./components/chapter-map/chapter-map-header";
import { ink } from "./components/chapter-map/chapter-map-ink";
import { CoachBubble } from "./components/chapter-map/coach-bubble";
import { MapFriends } from "./components/chapter-map/map-friends";
import { MapNodeButton } from "./components/chapter-map/map-node-button";
import { NextChapterDoor } from "./components/chapter-map/next-chapter-door";
import { PathTile } from "./components/chapter-map/path-tile";

const MAP_ART = require("@/assets/images/story/kitchen-table-map.jpg");

/** Past a phone's width the map stops growing and sits centred on the night sky. */
const MAX_MAP_WIDTH = 480;
/** The spec opens with the next node about 520 of 844 points down the screen. */
const FOCUS_FROM_TOP = 520 / 844;

export interface ChapterMapScreenProps {
  progress: ChapterProgress;
  onPlay: (node: MapNode) => void;
  onBack: () => void;
}

export function ChapterMapScreen({ progress, onPlay, onBack }: ChapterMapScreenProps): ReactElement {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = Math.min(width, MAX_MAP_WIDTH) / MAP_WIDTH;
  const coach = coachFor(progress);
  const tiles = useMemo(() => pathTiles(progress), [progress]);
  const won = bossBeaten(progress);

  const scrollRef = useRef<ScrollView>(null);
  const focusY = Math.max(0, Math.min(MAP_HEIGHT * scale - height, coach.node.y * scale - height * FOCUS_FROM_TOP));
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
        <View style={{ width: MAP_WIDTH * scale, height: MAP_HEIGHT * scale, overflow: "hidden" }}>
          <View style={[styles.map, { transform: [{ scale }], transformOrigin: [0, 0, 0] }]}>
            <Image source={MAP_ART} style={StyleSheet.absoluteFill} contentFit="fill" accessible={false} />
            <NextChapterDoor open={won} />
            {tiles.map((tile, index) => (
              <PathTile key={index} tile={tile} />
            ))}
            <MapFriends coach={coach} />
            {KITCHEN_TABLE.nodes.map((node) => (
              <MapNodeButton key={node.id} node={node} state={nodeState(node, progress)} stars={progress[node.id] ?? 0} onPress={onPlay} />
            ))}
            <CoachBubble coach={coach} />
          </View>
        </View>
      </ScrollView>

      <ChapterMapHeader stars={chapterStars(progress)} topInset={insets.top} onBack={onBack} />
      <BadgeShelf won={won} bottom={insets.bottom + 24} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink.night },
  scrollContent: { alignItems: "center" },
  map: { width: MAP_WIDTH, height: MAP_HEIGHT, backgroundColor: "#131a2c" },
});
