/**
 * confirm-sheet.tsx — the navy sheet that confirms a store purchase (STO-1045, design 1a).
 *
 * A felt-table preview (the set's POKER tiles, or a pile of coins), the title, one line, then the
 * action: BUY with the price, or GET COINS when a tile set costs more than the player holds.
 * CANCEL and the scrim close it.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, layout } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";

import { CoinPile, GoldButton, OutlineButton, STORE } from "./store-art";

export type SheetLine = { readonly text: string; readonly tone?: "short" };

export interface ConfirmSheetProps {
  title: string;
  /** What sits on the felt: tile previews, or a pile of coins. */
  preview: ReactNode;
  line: SheetLine;
  /** The primary button: BUY · price, or GET COINS. */
  action: { label: string; accessibilityLabel: string; onPress: () => void };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
}

/** The sheet's coins for a pack: a bigger pile for a bigger pack, as on its card. */
export function PackPreview({ index }: { index: number }) {
  return <CoinPile count={Math.min(6, index + 2)} dx={36} dy={20} edge={3} size={48} top={28} />;
}

export function ConfirmSheet({ title, preview, line, action, busy, error, onCancel }: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="none" onRequestClose={onCancel} statusBarTranslucent supportedOrientations={MODAL_ORIENTATIONS} transparent visible>
      <Animated.View entering={FadeIn.duration(200)} style={styles.scrim}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onCancel} style={StyleSheet.absoluteFill} testID="store-sheet-scrim" />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(18).stiffness(170)} style={styles.slot}>
        <LinearGradient colors={["#141f45", "#0a1028"]} style={[styles.sheet, { paddingBottom: 34 + insets.bottom }]} testID="store-sheet">
          <View style={styles.handle} />
          <LinearGradient colors={["#3a8a56", "#174a2b"]} style={styles.felt}>{preview}</LinearGradient>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={[styles.line, line.tone === "short" && styles.short]} testID="store-sheet-line">{line.text}</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={[styles.line, styles.short]} testID="store-sheet-error">{error}</Text> : null}
          </View>
          <View style={styles.actions}>
            <OutlineButton label="CANCEL" onPress={onCancel} size="lg" style={styles.cancel} testID="store-sheet-cancel" />
            <GoldButton
              accessibilityLabel={action.accessibilityLabel}
              disabled={busy}
              label={busy ? "BUYING…" : action.label}
              onPress={action.onPress}
              size="lg"
              style={styles.confirm}
              testID="store-sheet-confirm"
            />
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

/** The sheet's line for a tile set: what's left after, or how many coins are missing. */
export function tileSetLine(price: number, coins: number | null): SheetLine {
  if (coins !== null && coins < price) return { text: `You need ${formatCoins(price - coins)} more coins.`, tone: "short" };
  if (coins === null) return { text: `Costs ${formatCoins(price)} coins.` };

  return { text: `Costs ${formatCoins(price)} coins. You’ll have ${formatCoins(coins - price)} left.` };
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(4, 6, 14, 0.65)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  slot: { alignSelf: "center", bottom: 0, maxWidth: layout.maxContentWidth, position: "absolute", width: "100%" },
  sheet: {
    borderTopColor: STORE.gold,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 2,
    boxShadow: "0px -14px 40px rgba(0, 0, 0, 0.6)",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: { alignSelf: "center", backgroundColor: "rgba(243, 230, 196, 0.3)", borderRadius: 3, height: 5, width: 42 },
  felt: {
    alignItems: "center",
    borderColor: STORE.lip,
    borderRadius: 65,
    borderWidth: 7,
    boxShadow: "0px 4px 0px #3a1c0c",
    height: 130,
    justifyContent: "center",
  },
  copy: { gap: 6 },
  title: { color: STORE.cream, fontFamily: fonts.arcade, fontSize: 24, letterSpacing: 0.7, lineHeight: 25 },
  line: { color: STORE.mute, fontFamily: fonts.rubik, fontSize: 14, lineHeight: 20 },
  short: { color: STORE.short },
  actions: { flexDirection: "row", gap: 10 },
  cancel: { flex: 1 },
  confirm: { flex: 1.6 },
});
