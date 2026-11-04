/**
 * The offline tray's STARTING CHIPS row (design 1a, C1): the stack every seat sits down with, and
 * whether each hand deals it again or the stacks carry from hand to hand.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinChip } from "@/components/chip/coin-chip";
import { fonts } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";
import { webTestID } from "@/lib/ui/web-id";

export const DEFAULT_STARTING_CHIPS = 1_000;

const OPTIONS = [500, 1_000, 2_500, 5_000] as const;

/** Whether stacks carry between hands; absent or anything else is a reset every hand. */
export function carryChipsOf(stored: string | null): boolean {
  return stored === "carry";
}

/** A stored pick the row still offers, or the default. */
export function startingChipsOf(stored: string | null): number {
  return OPTIONS.find((chips) => String(chips) === stored) ?? DEFAULT_STARTING_CHIPS;
}

export function StartingChips({ selected, onSelect, carry, onCarry }: {
  selected: number;
  onSelect: (chips: number) => void;
  /** Whether stacks carry between hands, rather than every hand dealing the starting chips again. */
  carry: boolean;
  onCarry: (carry: boolean) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.label}>STARTING CHIPS</Text>
        <Text style={styles.helper}>You and every bot start with this</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Starting chips" style={styles.row}>
        {OPTIONS.map((chips) => {
          const checked = chips === selected;
          return (
            <Pressable
              key={chips}
              accessibilityRole="radio"
              accessibilityLabel={`${formatCoins(chips)} practice chips`}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => onSelect(chips)}
              testID={`offline-chips-${chips}`}
              id={webTestID(`offline-chips-${chips}`)}
              style={({ pressed }) => [styles.option, checked ? styles.checked : styles.plain, pressed && styles.pressed]}
            >
              <CoinChip practice size={14} />
              <Text style={[styles.amount, checked && styles.amountChecked]}>{formatCoins(chips)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Between hands" style={styles.row}>
        {([false, true] as const).map((option) => {
          const checked = option === carry;
          const key = option ? "carry" : "reset";
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={option ? "Keep chips between hands" : "Reset chips every hand"}
              accessibilityState={{ checked }}
              aria-checked={checked}
              onPress={() => onCarry(option)}
              testID={`offline-chips-${key}`}
              id={webTestID(`offline-chips-${key}`)}
              style={({ pressed }) => [styles.option, checked ? styles.checked : styles.plain, pressed && styles.pressed]}
            >
              <Text style={[styles.mode, checked && styles.amountChecked]}>{option ? "KEEP CHIPS" : "RESET EVERY HAND"}</Text>
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
  row: { flexDirection: "row", gap: 8 },
  option: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 12, borderWidth: 2 },
  plain: { backgroundColor: "rgba(8,12,28,0.5)", borderColor: "rgba(243,230,196,0.2)" },
  checked: { backgroundColor: "#e0974a", borderColor: "#ffd877" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  amount: { flexShrink: 1, fontFamily: fonts.arcade, fontSize: 16, color: "#f3e6c4" },
  amountChecked: { color: "#2a1906" },
  mode: { flexShrink: 1, fontFamily: fonts.arcade, fontSize: 13, color: "#f3e6c4", textAlign: "center" },
});
