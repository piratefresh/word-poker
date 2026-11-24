import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { STORY_CHAPTERS } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import type { ChapterMap } from "@/features/story/chapter-map";

import { gradient, ink, lilita } from "./chapter-map-ink";
import { Padlock } from "./padlock";

export interface NextChapterDoorProps {
  /** The chapter the door leads out of; its `door` places it. */
  map: ChapterMap;
  open: boolean;
  /** Goes through the open door. */
  onEnter?: () => void;
}

/** The next chapter's doorway at the top of the map: shut and padlocked until the boss falls, then the way in. */
export function NextChapterDoor({ map, open, onEnter }: NextChapterDoorProps): ReactElement | null {
  const next = STORY_CHAPTERS[STORY_CHAPTERS.indexOf(map.chapter) + 1];
  if (map.door === undefined || next === undefined) return null;
  const { x, y } = map.door;
  // The door and its card both go through; only the door is announced, so the way in reads once.
  const press = { disabled: !open || onEnter === undefined, onPress: onEnter };
  return (
    <>
      <Pressable
        {...press}
        accessibilityLabel={`Chapter ${next.number}, ${next.venue}, ${open ? "open" : "locked"}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !open }}
        style={[styles.frame, { left: x, top: y, boxShadow: open ? "0px 0px 60px 12px rgba(255,190,110,0.5)" : "0px 0px 0px 3px #3a1a14" }]}
        testID="story-next-chapter"
      >
        <View style={[styles.door, gradient(open ? "linear-gradient(180deg, #ffe9b8, #f0b462)" : "linear-gradient(180deg, #2f7a52, #1f4a33)")]}>
          <View style={[styles.panel, { top: 40, height: 34 }]} />
          <View style={[styles.panel, { top: 84, height: 44 }]} />
        </View>
        {open ? null : <Padlock size={17} style={styles.lock} />}
      </Pressable>
      <Pressable {...press} accessible={false} style={[styles.card, { top: y + CARD_DROP, borderColor: open ? ink.gold : "rgba(125,131,152,0.7)" }]}>
        <Text style={styles.kicker}>{`CHAPTER ${next.number}`}</Text>
        <Text style={styles.title}>{next.venue}</Text>
        <Text style={styles.copy}>{open ? "Unlocked. Tap the door." : `Beat ${map.boss} to unlock.`}</Text>
      </Pressable>
    </>
  );
}

/** The card sits this far below the door frame's top. */
const CARD_DROP = 46;

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    width: 110,
    height: 150,
    paddingTop: 7,
    paddingHorizontal: 7,
    borderTopLeftRadius: 55,
    borderTopRightRadius: 55,
    backgroundColor: "#2a160c",
  },
  door: { flex: 1, borderTopLeftRadius: 48, borderTopRightRadius: 48, overflow: "hidden" },
  panel: { position: "absolute", left: 12, right: 12, borderRadius: 4, boxShadow: "inset 0px 0px 0px 3px rgba(0,0,0,0.25)" },
  lock: { position: "absolute", left: 37, top: 58, width: 36, height: 36, borderRadius: 18, borderWidth: 3, boxShadow: "0px 4px 0px rgba(0,0,0,0.4)" },
  card: {
    position: "absolute",
    left: 14,
    width: 118,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 3,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: "rgba(10,8,24,0.82)",
  },
  kicker: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.9, color: "#f7d77a" },
  title: { fontFamily: lilita, fontSize: 18, lineHeight: 19, color: ink.cream },
  copy: { fontFamily: fonts.rubikMedium, fontSize: 11, lineHeight: 14, color: "#d6d0c2" },
});
