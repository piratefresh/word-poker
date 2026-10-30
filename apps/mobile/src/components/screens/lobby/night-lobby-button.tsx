import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { haptic } from "@/components/word-builder/haptics";
import { fonts, nightLobby } from "@/constants/theme";

interface NightLobbyButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * gold: the action. cream: the way back to your own seat. dashed: a Join that cannot be pressed.
   * outline: a small secondary way out (STORE, QUESTS). A disabled gold button draws as dashed.
   */
  tone?: "gold" | "cream" | "dashed" | "outline";
  /** A join in the air: still gold, dimmed, and not tappable. */
  busy?: boolean;
  /** Drawn after the label, in its ink — the coin and price on a Join. */
  children?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

/** The lobby's broad gold action, with a hard brass edge and its display face. */
export function NightLobbyButton({ label, onPress, disabled = false, tone = "gold", busy = false, children, accessibilityLabel, testID }: NightLobbyButtonProps) {
  const drawn = disabled && !busy && tone === "gold" ? "dashed" : tone;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => { haptic("settle"); onPress(); }}
      style={({ pressed }) => [
        styles.button,
        styles[drawn],
        busy && styles.busy,
        pressed && drawn !== "dashed" && styles.pressed,
      ]}
      testID={testID}
    >
      {drawn === "gold" ? <LinearGradient colors={nightLobby.gold.button} style={StyleSheet.absoluteFill} /> : null}
      <Text style={[styles.label, styles[`${drawn}Label`]]}>{label}</Text>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 56, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 16, overflow: "hidden" },
  gold: { backgroundColor: nightLobby.gold.button[1], borderBottomWidth: 5, borderBottomColor: nightLobby.gold.buttonEdge },
  cream: { backgroundColor: nightLobby.cream.face, borderBottomWidth: 5, borderBottomColor: nightLobby.cream.edge },
  dashed: { backgroundColor: "rgba(8,12,28,0.55)", borderColor: "rgba(243,230,196,0.45)", borderStyle: "dashed", borderWidth: 2 },
  outline: { borderColor: "rgba(243,230,196,0.45)", borderWidth: 2, minHeight: 44, paddingVertical: 8 },
  label: { color: nightLobby.gold.buttonText, fontFamily: fonts.arcade, fontSize: 21, letterSpacing: 0.6, textAlign: "center" },
  goldLabel: {},
  creamLabel: { color: nightLobby.cream.seatInk },
  dashedLabel: { color: nightLobby.text.dashed, fontSize: 17 },
  outlineLabel: { color: nightLobby.text.cream, fontSize: 15 },
  busy: { opacity: 0.85 },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 3 },
});
