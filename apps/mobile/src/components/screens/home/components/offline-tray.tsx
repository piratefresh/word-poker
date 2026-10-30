import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { formatCoins } from "@/lib/ui/format";
import { webTestID } from "@/lib/ui/web-id";

import { ModeVariants, type ModeVariant } from "./mode-variants";
import { StartingChips, startingChipsOf } from "./starting-chips";
import { TrayFrame } from "./tray-frame";

const MODE_KEY = "offline-mode";
const CHIPS_KEY = "offline-starting-chips";

/** Lives inside the Home scene, leaving the header and native tab rack interactive. */
export function OfflineTray<V extends ModeVariant>({ variants, onDeal, onClose, maxHeight }: {
  variants: readonly [V, ...V[]];
  onDeal: (variant: V, startingChips: number) => void;
  onClose: () => void;
  maxHeight: number;
}) {
  const [selected, setSelected] = useState(() =>
    variants.find((variant) => variant.key === readItem(MODE_KEY)) ?? variants[0],
  );
  const [chips, setChips] = useState(() => startingChipsOf(readItem(CHIPS_KEY)));

  return (
    <TrayFrame id="offline" title="OFFLINE" subline="Free practice chips · your coins are never at stake" closeLabel="Close offline modes" onClose={onClose} maxHeight={maxHeight}>
      <ModeVariants variants={variants} selectedKey={selected.key} onSelect={(variant) => {
        setSelected(variant);
        writeItem(MODE_KEY, variant.key);
      }} />
      <StartingChips selected={chips} onSelect={(next) => {
        setChips(next);
        writeItem(CHIPS_KEY, String(next));
      }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Deal. Free practice game, your coins are not used." onPress={() => onDeal(selected, chips)} testID="offline-deal" id={webTestID("offline-deal")} style={({ pressed }) => [styles.deal, pressed && styles.pressed]}>
        <LinearGradient colors={["#ffd877", "#e6a73e"]} style={styles.dealFace}>
          <Text style={styles.dealText}>DEAL</Text>
          <View style={styles.free}><Text style={styles.freeText}>FREE</Text></View>
        </LinearGradient>
      </Pressable>
      <Text style={styles.note} testID="offline-deal-note">{`Everyone gets ${formatCoins(chips)} practice chips. Your coins stay in your wallet.`}</Text>
    </TrayFrame>
  );
}

const styles = StyleSheet.create({
  deal: { borderRadius: 12, overflow: "hidden", borderBottomWidth: 5, borderBottomColor: "#9a5f1c" },
  dealFace: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 8 },
  dealText: { fontFamily: fonts.arcade, fontSize: 21, color: "#3a2210", textAlign: "center" },
  free: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: "#1f4a33" },
  freeText: { fontFamily: fonts.arcade, fontSize: 15, color: "#bff0c8" },
  note: { fontFamily: fonts.rubikMedium, fontSize: 13, lineHeight: 18, color: "#d8ccaf", textAlign: "center" },
  pressed: { opacity: 0.85, transform: [{ translateY: 2 }] },
});
