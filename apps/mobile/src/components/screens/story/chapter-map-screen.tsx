/**
 * chapter-map-screen.tsx — Story mode's Chapter 1 map (STO-861 v3): the hand-inked house scrolled
 * bottom to top, with the letter-tile path, the five nodes, the coach bubble, the Chapter 2
 * doorway, and the badge shelf drawn over the art from `kitchen-table-map.ts`.
 *
 * The map is laid out in the art's 390-wide frame and scaled to the screen as one layer, so node
 * positions stay the spec's numbers. Node states each carry a shape cue (padlock, PLAY, check),
 * never colour alone.
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts } from "@/constants/theme";
import {
  FRIENDS,
  KITCHEN_TABLE,
  MAP_HEIGHT,
  MAP_WIDTH,
  bossBeaten,
  chapterStars,
  coachFor,
  discSize,
  nodeState,
  pathTiles,
  type ChapterProgress,
  type CoachLine,
  type FriendId,
  type MapNode,
  type MapNodeState,
} from "@/features/story/kitchen-table-map";
import { useLoopsEnabled } from "@/motion";

const MAP_ART = require("@/assets/images/story/kitchen-table-map.jpg");

/** Past a phone's width the map stops growing and sits centred on the night sky. */
const MAX_MAP_WIDTH = 480;
/** The spec opens with the next node about 520 of 844 points down the screen. */
const FOCUS_FROM_TOP = 520 / 844;
const NODE_COLUMN = 140;

/** The scene's own palette: warm parchment and lamp gold on a dusk-blue night. */
const ink = {
  night: "#0b1130",
  parchment: "#fff6e2",
  cream: "#f7e7b5",
  gold: "#ffd34d",
  goldDeep: "#8a4e10",
  plum: "#2a1a3a",
  slate: "#7d8398",
  slateLight: "#c9cedd",
  scrim: "rgba(10,8,24,0.8)",
  amber: "#e0974a",
};

const LOOKS: Record<MapNodeState, { bg: string; edge: string; rim: string; fg: string }> = {
  completed: { bg: "radial-gradient(circle at 35% 30%, #8ee896, #2e9a4a 60%, #1f6e35)", edge: "#14502a", rim: "#e8f7d8", fg: "#ffffff" },
  available: { bg: "radial-gradient(circle at 35% 30%, #fff1b0, #ffc83d 55%, #d98a1c)", edge: ink.goldDeep, rim: ink.parchment, fg: "#4a2608" },
  locked: { bg: "radial-gradient(circle at 35% 30%, #5a6178, #373d52 60%, #262a3a)", edge: "#141725", rim: ink.slate, fg: "rgba(220,225,240,0.6)" },
};

/** A CSS gradient as a style: native reads `experimental_backgroundImage`, web the plain key. */
const gradient = (image: string): ViewStyle =>
  (Platform.OS === "web" ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;

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
              <View
                key={index}
                style={[
                  styles.tile,
                  {
                    left: tile.x - 15,
                    top: tile.y - 16,
                    backgroundColor: tile.lit ? "#f6e6c4" : "#a59c8a",
                    boxShadow: `0px 4px 0px ${tile.lit ? "#a87a3e" : "#4e483c"}, 0px 8px 10px rgba(0,0,0,0.35)`,
                    transform: [{ rotate: `${tile.rotation}deg` }],
                  },
                ]}
              >
                <Text style={[styles.tileLetter, { color: tile.lit ? "#3a2210" : "#3e392f" }]}>{tile.letter}</Text>
              </View>
            ))}
            <Friends coach={coach} />
            {KITCHEN_TABLE.nodes.map((node) => (
              <MapNodeButton key={node.id} node={node} state={nodeState(node, progress)} stars={progress[node.id] ?? 0} onPress={onPlay} />
            ))}
            <CoachBubble coach={coach} />
          </View>
        </View>
      </ScrollView>

      <LinearGradient
        colors={["rgba(6,8,22,0.94)", "rgba(6,8,22,0.78)", "rgba(6,8,22,0)"]}
        locations={[0, 0.7, 1]}
        pointerEvents="box-none"
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.back} testID="story-back">
          <Ionicons name="chevron-back" size={24} color={ink.cream} />
        </Pressable>
        <View accessibilityLabel={`Chapter ${KITCHEN_TABLE.number}, ${KITCHEN_TABLE.title}`} accessibilityRole="header" style={styles.titleBlock}>
          <Text style={styles.titleKicker}>{`CHAPTER ${KITCHEN_TABLE.number}`}</Text>
          <Text numberOfLines={1} style={styles.title}>
            {KITCHEN_TABLE.title}
          </Text>
        </View>
        <View accessibilityLabel={`${chapterStars(progress)} of ${KITCHEN_TABLE.maxStars} stars`} style={styles.starTotal}>
          <Text style={styles.starTotalIcon}>★</Text>
          <Text style={styles.starTotalText}>{`${chapterStars(progress)}/${KITCHEN_TABLE.maxStars}`}</Text>
        </View>
      </LinearGradient>

      <BadgeShelf won={won} bottom={insets.bottom + 24} />
    </View>
  );
}

function MapNodeButton({
  node,
  state,
  stars,
  onPress,
}: {
  node: MapNode;
  state: MapNodeState;
  stars: number;
  onPress: (node: MapNode) => void;
}) {
  const size = discSize(node);
  const look = LOOKS[state];
  const locked = state === "locked";
  const available = state === "available";
  const label = `${node.title}, ${locked ? "locked" : available ? "play" : `completed, ${stars} of 3 stars`}`;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={() => onPress(node)}
      style={[styles.node, { left: node.x - NODE_COLUMN / 2, top: node.y - size / 2 }]}
      testID={`story-node-${node.id}`}
    >
      {node.kind === "boss" ? (
        <View style={[styles.threshold, { borderColor: locked ? "#9aa0b4" : ink.gold }]}>
          <Text style={[styles.thresholdText, { color: locked ? "#9aa0b4" : ink.gold }]}>{`BEAT ${KITCHEN_TABLE.threshold} PTS`}</Text>
        </View>
      ) : null}
      {available ? <Pulse size={size} /> : null}
      <View
        style={[
          styles.disc,
          gradient(look.bg),
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: look.rim,
            boxShadow: `0px 6px 0px ${look.edge}, inset 0px -6px 10px rgba(0,0,0,0.25), inset 0px 6px 8px rgba(255,255,255,0.4), 0px 14px 18px rgba(0,0,0,0.45)`,
          },
        ]}
      >
        <Text style={[styles.glyph, { color: look.fg, fontSize: state === "completed" ? 34 : node.kind === "boss" ? 40 : 30 }]}>
          {state === "completed" ? "✓" : node.glyph}
        </Text>
        {locked ? <Padlock style={styles.discLock} /> : null}
      </View>
      <View style={styles.labels}>
        <View style={styles.starRow}>
          {[0, 1, 2].map((slot) => (
            <Text
              key={slot}
              style={[
                styles.star,
                slot < stars ? styles.starEarned : { color: locked ? "rgba(200,205,225,0.6)" : "rgba(255,240,210,0.8)" },
              ]}
            >
              {slot < stars ? "★" : "☆"}
            </Text>
          ))}
        </View>
        <Text
          style={[
            styles.plate,
            available
              ? { backgroundColor: ink.parchment, color: "#3a2210" }
              : { backgroundColor: locked ? "rgba(12,10,28,0.75)" : "rgba(12,10,28,0.85)", color: locked ? "#b4bacd" : ink.cream },
          ]}
        >
          {node.title}
        </Text>
        {node.kind === "bonus" ? <Text style={styles.bonusTag}>OPTIONAL · STARS ONLY</Text> : null}
        {available ? (
          <LinearGradient colors={["#6fdc78", "#2e9a4a"]} style={styles.play}>
            <Text style={styles.playText}>PLAY</Text>
          </LinearGradient>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The available node's halo: grows and fades on a loop, or holds still under reduced motion. */
function Pulse({ size }: { size: number }) {
  const reduceMotion = useReducedMotion();
  const loopsEnabled = useLoopsEnabled();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || !loopsEnabled) {
      cancelAnimation(progress);
      progress.value = 0.3;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [loopsEnabled, progress, reduceMotion]);

  const ring = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 0.92 + 0.38 * progress.value }],
  }));
  const ringSize = size + 28;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, left: (NODE_COLUMN - ringSize) / 2 }, ring]}
    />
  );
}

function Padlock({ style, size = 14 }: { style?: ViewStyle; size?: number }) {
  return (
    <View style={[styles.padlock, style]}>
      <Ionicons name="lock-closed" size={size} color={ink.slateLight} />
    </View>
  );
}

function Avatar({ friend, size, style }: { friend: FriendId; size: number; style?: ViewStyle }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: FRIENDS[friend].color }, style]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.48 }]}>{FRIENDS[friend].name[0]}</Text>
    </View>
  );
}

/** The friends around their nodes, and all three watching the boss; the one coaching sits in the bubble instead. */
function Friends({ coach }: { coach: CoachLine }) {
  const seats: { friend: FriendId; x: number; y: number }[] = [];
  for (const node of KITCHEN_TABLE.nodes) {
    if (node.kind === "boss") {
      const watchers: [number, number, FriendId][] = [[-96, 6, "ellis"], [96, 6, "jay"], [92, -70, "mira"]];
      for (const [dx, dy, friend] of watchers) {
        if (!(coach.node === node && coach.friend === friend)) seats.push({ friend, x: node.x + dx, y: node.y + dy });
      }
    } else if (node.friend && coach.node !== node) {
      seats.push({ friend: node.friend.id, x: node.x + node.friend.dx, y: node.y - 8 });
    }
  }
  return seats.map(({ friend, x, y }) => (
    <View key={`${friend}-${x}-${y}`} pointerEvents="none" style={[styles.friend, { left: x - 40, top: y - 33 }]}>
      <Avatar friend={friend} size={40} />
      <Text style={styles.friendName}>{FRIENDS[friend].name}</Text>
    </View>
  ));
}

function CoachBubble({ coach }: { coach: CoachLine }) {
  const { node } = coach;
  const size = discSize(node);
  const left = Math.max(10, Math.min(MAP_WIDTH - 260, node.x - 125));
  const top = node.y - size / 2 - (node.kind === "boss" ? 56 : 18) - 92;
  const pointer = Math.max(20, Math.min(222, node.x - left - 9));
  return (
    <View accessibilityLiveRegion="polite" style={[styles.coach, { left, top }]} testID="story-coach">
      <Avatar friend={coach.friend} size={46} style={styles.coachAvatar} />
      <View style={styles.coachCopy}>
        <Text style={styles.coachName}>{FRIENDS[coach.friend].name.toUpperCase()}</Text>
        <Text style={styles.coachLine}>{coach.line}</Text>
      </View>
      <View style={[styles.coachPointer, { left: pointer }]} />
    </View>
  );
}

/** Chapter 2's pub doorway at the top of the map: shut and padlocked until the boss falls. */
function NextChapterDoor({ open }: { open: boolean }) {
  return (
    <>
      <View style={[styles.doorFrame, { boxShadow: open ? "0px 0px 60px 12px rgba(255,190,110,0.5)" : "0px 0px 0px 3px #3a1a14" }]}>
        <View style={[styles.door, gradient(open ? "linear-gradient(180deg, #ffe9b8, #f0b462)" : "linear-gradient(180deg, #2f7a52, #1f4a33)")]}>
          <View style={[styles.doorPanel, { top: 40, height: 34 }]} />
          <View style={[styles.doorPanel, { top: 84, height: 44 }]} />
        </View>
        {open ? null : <Padlock size={17} style={styles.doorLock} />}
      </View>
      <View style={[styles.doorCard, { borderColor: open ? ink.gold : "rgba(125,131,152,0.7)" }]}>
        <Text style={styles.doorKicker}>{`CHAPTER ${KITCHEN_TABLE.number + 1}`}</Text>
        <Text style={styles.doorTitle}>{KITCHEN_TABLE.nextChapter}</Text>
        <Text style={styles.doorCopy}>{open ? "Unlocked. Opening soon." : `Beat ${KITCHEN_TABLE.boss} to unlock.`}</Text>
      </View>
    </>
  );
}

/** One slot per boss; Chapter 1 has the Professor's. Fixed to the corner, over the scroll. */
function BadgeShelf({ won, bottom }: { won: boolean; bottom: number }) {
  return (
    <View
      accessibilityLabel={won ? `Badge shelf: ${KITCHEN_TABLE.badge}` : "Badge shelf, empty"}
      pointerEvents="none"
      style={[styles.shelf, { bottom }]}
      testID="story-badge-shelf"
    >
      <View style={styles.shelfSlot}>
        {won ? (
          <View style={styles.badge}>
            <View style={[styles.ribbon, { left: 12, backgroundColor: FRIENDS.jay.color, transform: [{ skewX: "12deg" }] }]} />
            <View style={[styles.ribbon, { right: 12, backgroundColor: FRIENDS.ellis.color, transform: [{ skewX: "-12deg" }] }]} />
            <View style={[styles.medal, gradient("radial-gradient(circle at 35% 30%, #ffe9a0, #e0a23a 65%, #b57a22)")]}>
              <Text style={styles.medalLetter}>P</Text>
            </View>
          </View>
        ) : (
          <View style={styles.shelfEmpty}>
            <View style={styles.shelfEmptyRing} />
          </View>
        )}
      </View>
      <View style={styles.shelfBoard} />
      <Text numberOfLines={1} style={styles.shelfLabel}>{won ? KITCHEN_TABLE.badge.toUpperCase() : "BADGE SHELF"}</Text>
    </View>
  );
}

const lilita = fonts.arcade;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink.night },
  scrollContent: { alignItems: "center" },
  map: { width: MAP_WIDTH, height: MAP_HEIGHT, backgroundColor: "#131a2c" },

  tile: { position: "absolute", width: 30, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  tileLetter: { fontFamily: lilita, fontSize: 18, lineHeight: 20 },

  node: { position: "absolute", width: NODE_COLUMN, alignItems: "center", zIndex: 3 },
  pulse: {
    position: "absolute",
    top: -14,
    boxShadow: "0px 0px 0px 3px rgba(255,214,120,0.9), 0px 0px 30px 8px rgba(255,200,90,0.55)",
  },
  disc: { borderWidth: 4, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: lilita, textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  discLock: { position: "absolute", right: -8, bottom: -6 },
  threshold: {
    position: "absolute",
    top: -38,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: ink.plum,
    boxShadow: "0px 3px 0px rgba(0,0,0,0.35)",
  },
  thresholdText: { fontFamily: lilita, fontSize: 13, letterSpacing: 0.65 },
  labels: { marginTop: 10, alignItems: "center", gap: 4 },
  starRow: { flexDirection: "row", gap: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(10,8,24,0.72)" },
  star: { fontFamily: fonts.rubik, fontSize: 16, lineHeight: 18 },
  starEarned: { color: ink.gold, textShadowColor: ink.goldDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  plate: { fontFamily: lilita, fontSize: 13, lineHeight: 16, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  bonusTag: {
    fontFamily: lilita,
    fontSize: 10,
    letterSpacing: 0.8,
    color: ink.cream,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(247,231,181,0.7)",
  },
  play: {
    minWidth: 88,
    height: 34,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d8f6c8",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 0px #14502a, 0px 8px 12px rgba(0,0,0,0.4)",
  },
  playText: { fontFamily: lilita, fontSize: 17, letterSpacing: 1, color: "#ffffff", textShadowColor: "#14502a", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },

  padlock: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ink.slate,
    backgroundColor: "#1a1d2b",
    alignItems: "center",
    justifyContent: "center",
  },

  avatar: { borderWidth: 3, borderColor: ink.parchment, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 0px rgba(0,0,0,0.35)" },
  avatarInitial: { fontFamily: lilita, color: "#ffffff" },
  friend: { position: "absolute", width: 80, alignItems: "center", gap: 3, zIndex: 2 },
  friendName: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.4, color: ink.cream, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: ink.scrim, overflow: "hidden" },

  coach: {
    position: "absolute",
    width: 250,
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: ink.plum,
    backgroundColor: ink.parchment,
    boxShadow: `0px 5px 0px ${ink.plum}, 0px 12px 20px rgba(0,0,0,0.4)`,
  },
  coachAvatar: { boxShadow: `0px 0px 0px 2px ${ink.plum}` },
  coachCopy: { flex: 1, gap: 2 },
  coachName: { fontFamily: lilita, fontSize: 12, letterSpacing: 0.7, color: ink.goldDeep },
  coachLine: { fontFamily: fonts.rubikSemiBold, fontSize: 14, lineHeight: 18, color: ink.plum },
  coachPointer: {
    position: "absolute",
    bottom: -12,
    width: 18,
    height: 18,
    backgroundColor: ink.parchment,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: ink.plum,
    transform: [{ rotate: "45deg" }],
  },

  doorFrame: {
    position: "absolute",
    left: 140,
    top: 104,
    width: 110,
    height: 150,
    paddingTop: 7,
    paddingHorizontal: 7,
    borderTopLeftRadius: 55,
    borderTopRightRadius: 55,
    backgroundColor: "#2a160c",
  },
  door: { flex: 1, borderTopLeftRadius: 48, borderTopRightRadius: 48, overflow: "hidden" },
  doorPanel: { position: "absolute", left: 12, right: 12, borderRadius: 4, boxShadow: "inset 0px 0px 0px 3px rgba(0,0,0,0.25)" },
  doorLock: { position: "absolute", left: 37, top: 58, width: 36, height: 36, borderRadius: 18, borderWidth: 3, boxShadow: "0px 4px 0px rgba(0,0,0,0.4)" },
  doorCard: {
    position: "absolute",
    left: 14,
    top: 150,
    width: 118,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 3,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "rgba(10,8,24,0.82)",
  },
  doorKicker: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.9, color: "#f7d77a" },
  doorTitle: { fontFamily: lilita, fontSize: 18, lineHeight: 19, color: ink.cream },
  doorCopy: { fontFamily: fonts.rubikMedium, fontSize: 11, lineHeight: 14, color: "#d6d0c2" },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 22,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: ink.amber,
    backgroundColor: "rgba(8,12,28,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  titleKicker: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.9, color: "#f7d77a" },
  title: { fontFamily: lilita, fontSize: 21, lineHeight: 23, letterSpacing: 0.4, color: ink.cream },
  starTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: ink.amber,
    backgroundColor: "rgba(8,12,28,0.8)",
  },
  starTotalIcon: { fontFamily: fonts.rubik, fontSize: 18, color: ink.gold, textShadowColor: ink.goldDeep, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  starTotalText: { fontFamily: lilita, fontSize: 16, letterSpacing: 0.5, color: ink.cream },

  shelf: { position: "absolute", right: 6, width: 124, zIndex: 10, alignItems: "center" },
  shelfSlot: { width: 64, height: 58, alignItems: "center", justifyContent: "flex-end" },
  shelfEmpty: {
    width: 56,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(247,231,181,0.55)",
    backgroundColor: "rgba(8,12,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  shelfEmptyRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: ink.slateLight, opacity: 0.5 },
  badge: { width: 50, height: 56, boxShadow: "0px 0px 14px rgba(255,210,110,0.7)", borderRadius: 25 },
  ribbon: { position: "absolute", top: 0, width: 10, height: 18 },
  medal: {
    position: "absolute",
    left: 3,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#fff1c0",
    alignItems: "center",
    justifyContent: "center",
  },
  medalLetter: { fontFamily: lilita, fontSize: 22, color: "#7a4a10" },
  shelfBoard: {
    width: 104,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#8f5530",
    boxShadow: "0px 4px 0px #3a1c0c, 0px 8px 12px rgba(0,0,0,0.45)",
  },
  shelfLabel: {
    marginTop: 8,
    fontFamily: lilita,
    fontSize: 11,
    letterSpacing: 0.7,
    color: ink.cream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(8,12,28,0.8)",
    overflow: "hidden",
  },
});
