import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radius } from "@/constants/theme";

export function FeltPanel({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.panel, style]} />;
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 8, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
