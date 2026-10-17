import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fontSize, fonts, gradients, radius, tileMaterial } from "@/constants/theme";

export function GoldBackButton({ onPress, accessibilityLabel }: {
  onPress: () => void;
  accessibilityLabel: "Back to sessions" | "Back to hands";
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.target}>
      {({ pressed }) => <LinearGradient colors={gradients.goldButton.colors} style={[styles.face, { transform: [{ translateY: pressed ? 2 : 0 }] }]}>
        <Text style={styles.text}>‹</Text>
      </LinearGradient>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  face: { width: 36, height: 36, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 0, color: tileMaterial.edge }] },
  text: { color: colors.onGold, fontFamily: fonts.arcade, fontSize: fontSize.title },
});
