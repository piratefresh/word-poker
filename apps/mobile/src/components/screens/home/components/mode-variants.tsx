/** Equal-width, single-select mode cards in the offline felt tray. */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

export type ModeVariant = {
  key: string;
  label: string;
  description: string;
  testID?: string;
};

type ModeVariantsProps<V extends ModeVariant> = {
  variants: readonly V[];
  disabled?: boolean;
  onSelect: (variant: V) => void;
  selectedKey: string;
};

const ART_SIZE = 56;

export function ModeVariants<V extends ModeVariant>({
  variants,
  disabled = false,
  onSelect,
  selectedKey,
}: ModeVariantsProps<V>) {
  return (
    <View style={styles.row}>
      {variants.map((variant) => {
        const selected = variant.key === selectedKey;
        return (
          <Pressable
            key={variant.key}
            accessibilityLabel={`${variant.label}: ${variant.description}`}
            accessibilityRole="radio"
            accessibilityState={{ disabled, checked: selected }}
            aria-checked={selected}
            disabled={disabled}
            id={webTestID(variant.testID)}
            onPress={() => onSelect(variant)}
            style={({ pressed }) => [
              styles.tile,
              selected ? styles.selected : styles.plain,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
            testID={variant.testID}
          >
            {selected ? <Text accessible={false} style={styles.check}>✓</Text> : null}
            <View accessible={false} style={styles.art}>
              {variant.key === "wild" ? (
                <>
                  <View style={[styles.letterTile, styles.wildTile]}><Text style={styles.letter}>W</Text></View>
                  <View style={styles.coin}><Text style={styles.spark}>✦</Text></View>
                </>
              ) : (
                <>
                  <View style={[styles.letterTile, styles.tileA]}><Text style={styles.letter}>A</Text></View>
                  <View style={[styles.letterTile, styles.tileB]}><Text style={styles.letter}>B</Text></View>
                </>
              )}
            </View>
            <Text style={styles.label}>{variant.key === "wild" ? "WILD\nPOWER" : variant.label.toUpperCase()}</Text>
            <Text style={styles.description}>
              {variant.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: "stretch", flexDirection: "row", gap: 10 },
  tile: { alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 3, flex: 1, minWidth: 0, minHeight: 176, gap: 6, paddingHorizontal: 8, paddingVertical: 14 },
  plain: { backgroundColor: "rgba(0,0,0,0.2)", borderColor: "rgba(243,230,196,0.16)" },
  selected: { backgroundColor: "rgba(247,215,122,0.12)", borderColor: "#f7d77a" },
  check: { position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: 11, textAlign: "center", lineHeight: 22, fontSize: 15, color: "#253429", backgroundColor: "#f7d77a" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  art: { height: ART_SIZE, width: ART_SIZE, marginBottom: 2 },
  letterTile: { position: "absolute", width: 34, height: 42, borderRadius: 4, backgroundColor: "#f3e6c4", borderBottomWidth: 4, borderBottomColor: "#b87939", alignItems: "center", justifyContent: "center" },
  letter: { fontFamily: fonts.arcade, fontSize: 27, color: "#302b1c" },
  tileA: { left: 2, top: 10, transform: [{ rotate: "-10deg" }] },
  tileB: { left: 23, top: 5, transform: [{ rotate: "8deg" }] },
  wildTile: { left: 9, top: 5, backgroundColor: "#b3c29a", borderBottomColor: "#718361", transform: [{ rotate: "-7deg" }] },
  coin: { position: "absolute", right: 0, bottom: 0, width: 27, height: 27, borderRadius: 14, backgroundColor: "#f6cf67", borderBottomWidth: 3, borderBottomColor: "#a9772b", alignItems: "center", justifyContent: "center" },
  spark: { color: "#56401d", fontSize: 19 },
  label: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 19, textAlign: "center" },
  description: { color: "#d8ccaf", fontFamily: "Rubik_500Medium", fontSize: 13, lineHeight: 18, textAlign: "center", minHeight: 36 },
});
