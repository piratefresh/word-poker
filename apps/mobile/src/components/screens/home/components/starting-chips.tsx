/** The offline tray's STARTING CHIPS row (design 1a, C1): the stack every seat sits down with. */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";
import { webTestID } from "@/lib/ui/web-id";

export const DEFAULT_STARTING_CHIPS = 1_000;

const OPTIONS = [
  { chips: 500, label: "500" },
  { chips: 1_000, label: "1K" },
  { chips: 2_500, label: "2.5K" },
  { chips: 5_000, label: "5K" },
] as const;

/** A stored pick the row still offers, or the default. */
export function startingChipsOf(stored: string | null): number {
  return OPTIONS.find((option) => String(option.chips) === stored)?.chips ?? DEFAULT_STARTING_CHIPS;
}

export function StartingChips({ selected, onSelect }: { selected: number; onSelect: (chips: number) => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.label}>STARTING CHIPS</Text>
        <Text style={styles.helper}>You and every bot start with this</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Starting chips" style={styles.row}>
        {OPTIONS.map(({ chips, label }) => {
          const checked = chips === selected;
          const isDefault = chips === DEFAULT_STARTING_CHIPS;
          return (
            <Pressable
              key={chips}
              accessibilityRole="radio"
              accessibilityLabel={`${formatCoins(chips)} practice chips${isDefault ? ", default" : ""}`}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => onSelect(chips)}
              testID={`offline-chips-${chips}`}
              id={webTestID(`offline-chips-${chips}`)}
              style={({ pressed }) => [styles.option, checked ? styles.checked : styles.plain, pressed && styles.pressed]}
            >
              <View accessible={false} style={styles.chip} />
              <Text style={[styles.amount, checked && styles.amountChecked]}>{label}</Text>
              {isDefault ? (
                <View accessible={false} style={styles.tag}><Text style={styles.tagText}>DEFAULT</Text></View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  label: { fontFamily: fonts.rubikSemiBold, fontSize: 12, letterSpacing: 1.4, color: "#d8ccaf" },
  helper: { flexShrink: 1, fontFamily: fonts.rubikMedium, fontSize: 12, color: "#d8ccaf", textAlign: "right" },
  row: { flexDirection: "row", gap: 8, paddingTop: 6 },
  option: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 2 },
  plain: { backgroundColor: "rgba(8,12,28,0.5)", borderColor: "rgba(243,230,196,0.2)" },
  checked: { backgroundColor: "#e0974a", borderColor: "#ffd877" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  // The silver practice chip: never the gold of a coin.
  chip: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#e3e7ee", borderWidth: 2, borderColor: "#8d96a6" },
  amount: { fontFamily: fonts.arcade, fontSize: 17, color: "#f3e6c4" },
  amountChecked: { color: "#2a1906" },
  tag: { position: "absolute", top: -9, right: 4, paddingHorizontal: 5, borderRadius: 6, borderWidth: 1, borderColor: "#e0974a", backgroundColor: "#1f4a33" },
  tagText: { fontFamily: fonts.arcade, fontSize: 9.5, color: "#f7d77a" },
});
