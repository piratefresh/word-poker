import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { KITCHEN_TABLE } from "@/features/story/kitchen-table-map";

import { gradient, ink, lilita } from "./chapter-map-ink";
import { Padlock } from "./padlock";

/** Chapter 2's pub doorway at the top of the map: shut and padlocked until the boss falls. */
export function NextChapterDoor({ open }: { open: boolean }): ReactElement {
  return (
    <>
      <View style={[styles.frame, { boxShadow: open ? "0px 0px 60px 12px rgba(255,190,110,0.5)" : "0px 0px 0px 3px #3a1a14" }]}>
        <View style={[styles.door, gradient(open ? "linear-gradient(180deg, #ffe9b8, #f0b462)" : "linear-gradient(180deg, #2f7a52, #1f4a33)")]}>
          <View style={[styles.panel, { top: 40, height: 34 }]} />
          <View style={[styles.panel, { top: 84, height: 44 }]} />
        </View>
        {open ? null : <Padlock size={17} style={styles.lock} />}
      </View>
      <View style={[styles.card, { borderColor: open ? ink.gold : "rgba(125,131,152,0.7)" }]}>
        <Text style={styles.kicker}>{`CHAPTER ${KITCHEN_TABLE.number + 1}`}</Text>
        <Text style={styles.title}>{KITCHEN_TABLE.nextChapter}</Text>
        <Text style={styles.copy}>{open ? "Unlocked. Opening soon." : `Beat ${KITCHEN_TABLE.boss} to unlock.`}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
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
  panel: { position: "absolute", left: 12, right: 12, borderRadius: 4, boxShadow: "inset 0px 0px 0px 3px rgba(0,0,0,0.25)" },
  lock: { position: "absolute", left: 37, top: 58, width: 36, height: 36, borderRadius: 18, borderWidth: 3, boxShadow: "0px 4px 0px rgba(0,0,0,0.4)" },
  card: {
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
  kicker: { fontFamily: lilita, fontSize: 11, letterSpacing: 0.9, color: "#f7d77a" },
  title: { fontFamily: lilita, fontSize: 18, lineHeight: 19, color: ink.cream },
  copy: { fontFamily: fonts.rubikMedium, fontSize: 11, lineHeight: 14, color: "#d6d0c2" },
});
