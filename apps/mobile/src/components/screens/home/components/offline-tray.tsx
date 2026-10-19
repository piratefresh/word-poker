import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { fonts } from "@/constants/theme";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { webTestID } from "@/lib/ui/web-id";

import { ModeVariants, type ModeVariant } from "./mode-variants";
import { TrayFrame } from "./tray-frame";

const MODE_KEY = "offline-mode";

/** Lives inside the Home scene, leaving the header and native tab rack interactive. */
export function OfflineTray<V extends ModeVariant>({ variants, onDeal, onClose, maxHeight }: {
  variants: readonly [V, ...V[]];
  onDeal: (variant: V) => void;
  onClose: () => void;
  maxHeight: number;
}) {
  const [selected, setSelected] = useState(() =>
    variants.find((variant) => variant.key === readItem(MODE_KEY)) ?? variants[0],
  );

  return (
    <TrayFrame id="offline" title="OFFLINE" subline="Practice vs bots · pick a mode" closeLabel="Close offline modes" onClose={onClose} maxHeight={maxHeight}>
      <ModeVariants variants={variants} selectedKey={selected.key} onSelect={(variant) => {
        setSelected(variant);
        writeItem(MODE_KEY, variant.key);
      }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Deal ${selected.label}`} onPress={() => onDeal(selected)} testID="offline-deal" id={webTestID("offline-deal")} style={({ pressed }) => [styles.deal, pressed && styles.pressed]}>
        <LinearGradient colors={["#ffd877", "#e6a73e"]} style={styles.dealFace}>
          <Text style={styles.dealText}>{`DEAL · ${selected.label.toUpperCase()}`}</Text>
        </LinearGradient>
      </Pressable>
    </TrayFrame>
  );
}

const styles = StyleSheet.create({
  deal: { borderRadius: 12, overflow: "hidden", borderBottomWidth: 5, borderBottomColor: "#9a5f1c" },
  dealFace: { minHeight: 49, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  dealText: { fontFamily: fonts.arcade, fontSize: 21, color: "#39240f", textAlign: "center" },
  pressed: { opacity: 0.85, transform: [{ translateY: 2 }] },
});
