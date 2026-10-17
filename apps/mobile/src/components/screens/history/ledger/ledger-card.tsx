import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { colors, gradients, radius, tileMaterial } from "@/constants/theme";

const cardGradients = {
  default: gradients.tile.colors,
  winner: [colors.goldHi, gradients.tile.colors[1]] as const,
  muted: [gradients.tileDim.colors[0], gradients.tileDim.colors[1]] as const,
} as const;

type LedgerCardProps = {
  children: React.ReactNode;
  size?: "card" | "row";
  tone?: keyof typeof cardGradients;
  accessibilityLabel?: PressableProps["accessibilityLabel"];
  onPress?: PressableProps["onPress"];
  onLongPress?: PressableProps["onLongPress"];
};

export function LedgerCard({
  children,
  size = "card",
  tone = "default",
  accessibilityLabel,
  onPress,
  onLongPress,
}: LedgerCardProps) {
  const row = size === "row";
  const cardRadius = row ? radius.md : radius.card;
  const surface = (pressed: boolean) => (
    <LinearGradient colors={cardGradients[tone]} style={[styles.face, {
      borderRadius: cardRadius,
      transform: [{ translateY: pressed ? 2 : 0 }],
      boxShadow: [
        { offsetX: 0, offsetY: pressed ? 2 : row ? 3 : 4, blurRadius: 0, color: tileMaterial.edge },
        { offsetX: 0, offsetY: row ? 6 : 8, blurRadius: row ? 10 : 14, color: colors.surfaceStrong },
      ],
    }]}>{children}</LinearGradient>
  );
  return onPress || onLongPress ? (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={styles.target}
    >
      {({ pressed }) => surface(pressed)}
    </Pressable>
  ) : <View accessibilityLabel={accessibilityLabel}>{surface(false)}</View>;
}

const styles = StyleSheet.create({
  face: { padding: 12, gap: 8 },
  target: { minHeight: 44, justifyContent: "center" },
});
