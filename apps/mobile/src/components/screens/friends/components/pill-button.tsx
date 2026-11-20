import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

/** The clipboard's button inks: gold to join, green outline to invite, green fill to accept, brown outline for the quiet ones. */
const TONES = {
  primary: { box: { backgroundColor: "#f0bd5a", boxShadow: "0px 2px 0px #9a5f1c" }, ink: "#3a2210" },
  secondary: { box: { borderWidth: 1.5, borderColor: "#1f4a33", backgroundColor: "#ffffff" }, ink: "#1f4a33" },
  accept: { box: { backgroundColor: "#1f4a33" }, ink: "#fff4dc" },
  quiet: { box: { borderWidth: 1.5, borderColor: "#c9b896", backgroundColor: "#ffffff" }, ink: "#5a4a36" },
  ink: { box: { borderWidth: 1.5, borderColor: "#2a2f6a" }, ink: "#2a2f6a" },
  done: { box: { backgroundColor: "#efe6d2" }, ink: "#7a6a52" },
} as const;

export function PillButton({ label, tone, testID, disabled, ...props }: Omit<PressableProps, "children" | "style"> & {
  label: string;
  tone: keyof typeof TONES;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      id={webTestID(testID)}
      testID={testID}
      style={({ pressed }) => [styles.pill, TONES[tone].box, (pressed || disabled) && styles.dim]}
      {...props}
    >
      <Text numberOfLines={1} style={[styles.label, { color: TONES[tone].ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { height: 34, minWidth: 64, paddingHorizontal: 12, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.rubikSemiBold, fontSize: 13 },
  dim: { opacity: 0.7 },
});
