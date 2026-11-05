/**
 * store-art.tsx — the store's drawn pieces and buttons (STO-1045, design 1a): coins and their piles,
 * the daily-bonus chest, and the gold / outline / felt buttons.
 *
 * Lips are drop shadows (`boxShadow`), not thicker bottom borders, so a rounded border keeps the same
 * width all the way round. Gradients are the bordered view itself, never a layer painted over it.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { fonts, ledger } from "@/constants/theme";

export const STORE = {
  gold: "#e0974a",
  lip: "#6b3416",
  cream: "#f3e6c4",
  ink: "#f7e7b5",
  mute: "#aab3d6",
  felt: "#1f4a33",
  navy: "rgba(8, 12, 28, 0.8)",
  card: "rgba(8, 12, 28, 0.75)",
  rim: "rgba(243, 230, 196, 0.14)",
  bonus: "#7fd39a",
  short: "#ff8f73",
  tag: "#c2352b",
  tagEdge: "#f7d77a",
  darkInk: "#3a2210",
} as const;

const COIN_FACE = ["#ffe28a", "#c98a2c"] as const;

/** One gold coin, `size` across, lit from the top left. */
export function Coin({ size = 14, edge = 2 }: { size?: number; edge?: number }) {
  return (
    <LinearGradient
      colors={COIN_FACE}
      end={{ x: 0.85, y: 0.9 }}
      start={{ x: 0.25, y: 0.2 }}
      style={{ borderColor: "#8a4f14", borderRadius: size / 2, borderWidth: edge, height: size, width: size }}
    />
  );
}

/**
 * A loose pile of `count` coins, three to a row, each row above the last, the middle one raised.
 * `top` is where the first row sits; `dx`/`dy` the step between coins and rows (the design's piles).
 */
export function CoinPile({ count, size, top, dx, dy, edge = 2 }: { count: number; size: number; top: number; dx: number; dy: number; edge?: number }) {
  const coins = Array.from({ length: count }, (_, i) => ({
    left: (i % 3) * dx + (Math.floor(i / 3) % 2 ? dx / 2 : 0),
    top: top - dy * Math.floor(i / 3) - (i % 3 === 1 ? 4 : 0),
  }));
  const width = Math.max(...coins.map((c) => c.left)) + size;

  return (
    <View accessible={false} style={{ height: top + size + 3, width }}>
      {coins.map((coin, index) => (
        <View key={index} style={[styles.pileCoin, { left: coin.left, top: coin.top, borderRadius: size / 2 }]}>
          <Coin edge={edge} size={size} />
        </View>
      ))}
    </View>
  );
}

/** The daily-bonus chest: a rounded lid over the box, and a gold clasp. */
export function Chest() {
  return (
    <View accessible={false} style={styles.chest}>
      <LinearGradient colors={["#b87442", "#6b3416"]} style={styles.chestBox} />
      <LinearGradient colors={["#c98a4a", "#8a4c22"]} style={styles.chestLid} />
      <View style={styles.chestClasp} />
    </View>
  );
}

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZES: Record<ButtonSize, { box: ViewStyle; font: number; lip: string }> = {
  sm: { box: { height: 34, minWidth: 70, borderRadius: 10, paddingHorizontal: 10 }, font: 14, lip: "0px 3px 0px #8a4f14" },
  md: { box: { height: 38, minWidth: 84, borderRadius: 10, paddingHorizontal: 12 }, font: 15, lip: "0px 3px 0px #8a4f14" },
  lg: { box: { height: 54, borderRadius: 14, paddingHorizontal: 12 }, font: 18, lip: "0px 5px 0px #9a5f1c, 0px 10px 16px rgba(0, 0, 0, 0.4)" },
};

/** The gold action: gradient face on a lip, sinking onto it when pressed. */
export function GoldButton({ label, onPress, accessibilityLabel, disabled = false, icon, size = "md", style, testID }: ButtonProps) {
  const { box, font, lip } = SIZES[size];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled, style]}
      testID={testID}
    >
      <LinearGradient
        colors={ledger.goldButton}
        style={[styles.face, box, size !== "lg" && styles.goldEdge, { boxShadow: lip }]}
      >
        {icon}
        <Text style={[styles.label, { color: STORE.darkInk, fontSize: font }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** The quiet action: a gold outline, for EQUIP and CANCEL. */
export function OutlineButton({ label, onPress, accessibilityLabel, disabled = false, size = "md", style, testID }: ButtonProps) {
  const { box, font } = SIZES[size];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.face, styles.outline, box, pressed && styles.outlinePressed, disabled && styles.disabled, style]}
      testID={testID}
    >
      <Text style={[styles.label, { color: STORE.tagEdge, fontSize: font }]}>{label}</Text>
    </Pressable>
  );
}

/** A felt-green label in a button's shape, for a state the player can't press: IN USE. */
export function FeltTag({ label, size = "sm" }: { label: string; size?: ButtonSize }) {
  const { box, font } = SIZES[size];

  return (
    <View style={[styles.face, styles.feltTag, box]}>
      <Text style={[styles.label, { color: STORE.tagEdge, fontSize: font }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pileCoin: { boxShadow: "0px 2px 0px #6b3416", position: "absolute" },
  chest: { height: 40, width: 46 },
  chestLid: {
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderColor: "#4a2410",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 2,
    height: 17,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  chestBox: {
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderColor: "#4a2410",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderWidth: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 15,
  },
  chestClasp: { backgroundColor: STORE.tagEdge, borderColor: STORE.lip, borderRadius: 2, borderWidth: 1.5, height: 12, left: 19, position: "absolute", top: 10, width: 8 },
  face: { alignItems: "center", flexDirection: "row", gap: 5, justifyContent: "center" },
  goldEdge: { borderColor: "#9a5f1c", borderWidth: 2 },
  outline: { borderColor: STORE.gold, borderWidth: 2 },
  outlinePressed: { backgroundColor: "rgba(224, 151, 74, 0.15)" },
  feltTag: { backgroundColor: STORE.felt, borderColor: STORE.gold, borderWidth: 2 },
  label: { fontFamily: fonts.arcade, letterSpacing: 0.6 },
  pressed: { transform: [{ translateY: 2 }] },
  disabled: { opacity: 0.5 },
});
