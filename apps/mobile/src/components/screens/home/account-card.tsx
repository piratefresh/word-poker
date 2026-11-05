/**
 * account-card.tsx — the pieces the Account sheet (STO-1044) builds from, on the login form's cream
 * menu card: a section label, the light panel its rows sit on, a felt-green tag, a small gold
 * button and the gold toggle. Colours are the login card's, the gold buttons' and the felt tag's.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Children, type ReactNode, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { paper } from "@/components/screens/auth/auth-shell";
import { fonts } from "@/constants/theme";

const GOLD = ["#ffd877", "#e6a73e"] as const;
/** The felt tag: green felt, an amber edge, gold Lilita lettering. */
export const FELT = { face: "#1f4a33", edge: "#e0974a", ink: "#f7d77a" };

/** A small uppercase label over a group, with an optional note at its end (Display name's "✓ SAVED"). */
export function SectionLabel({ children, end }: { children: string; end?: ReactNode }) {
  return (
    <View style={styles.labelRow}>
      <Text accessibilityRole="header" style={styles.label}>{children}</Text>
      {end}
    </View>
  );
}

/** The light panel a section's rows sit on; each row after the first gets a thin divider. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <View style={styles.panel}>
      {Children.toArray(children).map((row, index) => (
        <View key={index} style={index > 0 && styles.divider}>{row}</View>
      ))}
    </View>
  );
}

/** A row in a panel: a title, a one-line caption under it, and its control at the end. */
export function Row({ title, caption, end }: { title: string; caption?: string; end?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {caption ? <Text numberOfLines={2} style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      {end}
    </View>
  );
}

/** A felt-green status pill: SIGNED IN, LINKED. */
export function FeltPill({ label }: { label: string }) {
  return (
    <View style={styles.feltPill}>
      <Text style={styles.feltPillLabel}>{label}</Text>
    </View>
  );
}

/** The small gold button of the sheet's header (DONE) and its rows (LINK). */
export function SmallGoldButton({ label, onPress, busy = false, testID }: { label: string; onPress: () => void; busy?: boolean; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.gold, pressed && styles.goldPressed, busy && styles.goldBusy]}
      testID={testID}
    >
      <LinearGradient colors={GOLD} style={styles.goldFace}>
        <Text style={styles.goldLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const KNOB_TRAVEL = 22;

/** The gold toggle: a brass track when on, a pale one when off, a cream tile for its knob. */
export function CardSwitch({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (value: boolean) => void; testID?: string }) {
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(value ? KNOB_TRAVEL : 0);
  useEffect(() => {
    offset.value = reducedMotion ? (value ? KNOB_TRAVEL : 0) : withTiming(value ? KNOB_TRAVEL : 0, { duration: 180 });
  }, [offset, reducedMotion, value]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[styles.track, value ? styles.trackOn : styles.trackOff]}
      testID={testID}
    >
      {value ? <LinearGradient colors={GOLD} style={StyleSheet.absoluteFill} /> : null}
      <Animated.View style={[styles.knob, knob]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  labelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  label: {
    color: paper.body,
    fontFamily: fonts.rubikSemiBold,
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: "uppercase",
  },
  panel: {
    backgroundColor: "#fffaf0",
    borderColor: "#e3c896",
    borderRadius: 12,
    borderWidth: 2,
    boxShadow: "0px 3px 0px #dcb888",
  },
  divider: { borderTopColor: "rgba(122, 86, 52, 0.18)", borderTopWidth: 1 },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 12 },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { color: "#2b1c10", fontFamily: fonts.rubikMedium, fontSize: 15 },
  rowCaption: { color: paper.body, fontFamily: fonts.rubik, fontSize: 12, lineHeight: 16 },
  feltPill: {
    backgroundColor: FELT.face,
    borderColor: FELT.edge,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  feltPillLabel: { color: FELT.ink, fontFamily: fonts.arcade, fontSize: 12, letterSpacing: 0.5 },
  gold: {
    borderColor: "#9a5f1c",
    borderRadius: 10,
    borderWidth: 2,
    boxShadow: "0px 3px 0px #8a4f14",
    height: 38,
    minWidth: 76,
    overflow: "hidden",
  },
  goldPressed: { boxShadow: "0px 1px 0px #8a4f14", transform: [{ translateY: 2 }] },
  goldBusy: { opacity: 0.75 },
  goldFace: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 14 },
  goldLabel: { color: paper.ink, fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.64 },
  track: { borderRadius: 999, borderWidth: 2, height: 32, overflow: "hidden", width: 54 },
  trackOn: { borderColor: "#9a5f1c" },
  trackOff: { backgroundColor: "#e6d2ab", borderColor: "#c9a978", boxShadow: "inset 0px 2px 3px rgba(90, 50, 20, 0.18)" },
  knob: {
    backgroundColor: "#fffdf6",
    borderRadius: 6,
    boxShadow: "0px 2px 0px #c4743a, 0px 2px 4px rgba(90, 50, 20, 0.3)",
    height: 22,
    left: 3,
    position: "absolute",
    top: 3,
    width: 22,
  },
});
