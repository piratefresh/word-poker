/**
 * menu-slab.tsx — one of the street menu's mode buttons (STO-597): a slab nailed to the screen's
 * left edge, rounded on the right, tilted a hair so the stack looks hand-placed.
 *
 * Like the table's GameButton, the face sits on a darker lip; a press sinks the face into it and
 * the lip closes. A green letter tile leads the label, and an optional green tag (the Tutorial's
 * "+100") hangs off the top-right corner.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

export type MenuSlabTone = "gold" | "cream";

export interface MenuSlabProps {
  label: string;
  /** The letter on the leading green tile. */
  letter: string;
  tone?: MenuSlabTone;
  /** A small reward tag on the top-right corner (e.g. "+100"). */
  tag?: string;
  /** The slab's width in points; the widest is the main action. */
  width: number;
  /** Degrees; the stack alternates ±0.8. */
  tilt: number;
  /** Nailed to the screen's left edge, so only the right end is rounded. A free slab rounds both. */
  attached?: boolean;
  onPress: () => void;
  testID?: string;
}

// The epic's palette (STO-595): gold highlight on an amber edge, cream text slabs, felt-green tiles.
const MENU = {
  gold: "#d4a24c",
  goldPressed: "#c3923f",
  goldEdge: "#e0974a",
  goldLip: "#8f5f22",
  goldInk: "#3a2410",
  cream: "#f7e7b5",
  creamPressed: "#e9d8a3",
  creamEdge: "#d9c392",
  creamLip: "#a58a55",
  creamInk: "#3a2410",
  green: "#1f4a33",
  greenLip: "#0f2a1c",
} as const;

const LIP = 5;
const HEIGHT = 50;
const RADIUS = 12;

const tones = {
  gold: { face: MENU.gold, pressed: MENU.goldPressed, edge: MENU.goldEdge, lip: MENU.goldLip, ink: MENU.goldInk },
  cream: { face: MENU.cream, pressed: MENU.creamPressed, edge: MENU.creamEdge, lip: MENU.creamLip, ink: MENU.creamInk },
} as const;

export function MenuSlab({ label, letter, tone = "cream", tag, width, tilt, attached = true, onPress, testID }: MenuSlabProps) {
  const t = tones[tone];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={{ width, transform: [{ rotate: `${tilt}deg` }] }}
      id={webTestID(testID)}
      testID={testID}
    >
      {({ pressed }) => (
        <View style={[styles.lip, !attached && styles.free, { backgroundColor: t.lip, marginTop: pressed ? LIP : 0, paddingBottom: pressed ? 0 : LIP }]}>
          <View style={[styles.face, !attached && styles.freeFace, { backgroundColor: pressed ? t.pressed : t.face, borderColor: t.edge }]}>
            <View style={styles.tile}>
              <Text style={styles.tileLetter}>{letter}</Text>
            </View>
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.label, { color: t.ink }]}>{label.toUpperCase()}</Text>
          </View>
          {tag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: {
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
  },
  free: { borderTopLeftRadius: RADIUS, borderBottomLeftRadius: RADIUS },
  freeFace: { borderTopLeftRadius: RADIUS, borderBottomLeftRadius: RADIUS, borderLeftWidth: 1.5 },
  face: {
    height: HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    borderWidth: 1.5,
    borderLeftWidth: 0,
  },
  tile: {
    width: 32,
    height: 34,
    borderRadius: 6,
    backgroundColor: MENU.green,
    borderBottomWidth: 3,
    borderBottomColor: MENU.greenLip,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLetter: { color: MENU.cream, fontFamily: fonts.arcade, fontSize: 20 },
  label: { flexShrink: 1, fontFamily: fonts.arcade, fontSize: 19 },
  tag: {
    position: "absolute",
    top: -9,
    right: -6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: MENU.green,
    borderWidth: 1,
    borderColor: MENU.cream,
  },
  tagText: { color: MENU.cream, fontFamily: fonts.arcade, fontSize: 12 },
});
