import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text } from "react-native";

import { haptic } from "@/components/word-builder/haptics";
import { fonts, nightLobby } from "@/constants/theme";

interface NightLobbyButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/** The lobby's broad gold action, with a hard brass edge and its display face. */
export function NightLobbyButton({ label, onPress, disabled, testID }: NightLobbyButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { haptic("settle"); onPress(); }}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
      testID={testID}
    >
      <LinearGradient colors={nightLobby.gold.button} style={StyleSheet.absoluteFill} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", minHeight: 58, paddingHorizontal: 12, paddingVertical: 14, backgroundColor: nightLobby.gold.button[1], borderRadius: 17, overflow: "hidden", borderBottomWidth: 5, borderBottomColor: nightLobby.gold.buttonEdge },
  label: { color: nightLobby.gold.buttonText, fontFamily: fonts.arcade, fontSize: 21, letterSpacing: 0.6, textAlign: "center" },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 3 },
});
