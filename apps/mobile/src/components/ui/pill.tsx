import { StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { fonts } from "@/constants/theme";

export type PillSize = "xs" | "sm" | "md" | "lg";

export type PillProps = {
  label: string;
  backgroundColor: string;
  color: string;
  size?: PillSize;
  animateBackground?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", borderRadius: 999 },
  text: { fontFamily: fonts.sansBold },
  extraSmall: { paddingVertical: 2, paddingHorizontal: 6 },
  small: { paddingVertical: 3, paddingHorizontal: 7 },
  medium: { paddingVertical: 4, paddingHorizontal: 10 },
  large: { paddingVertical: 6, paddingHorizontal: 12 },
  extraSmallText: { fontSize: 8.5, letterSpacing: 0.68 },
  smallText: { fontSize: 9.5, letterSpacing: 0.76 },
  mediumText: { fontSize: 12, letterSpacing: 0.5 },
  largeText: { fontSize: 14, letterSpacing: 0.25 },
});

const sizeStyles = {
  xs: styles.extraSmall,
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
} satisfies Record<PillSize, ViewStyle>;

const sizeTextStyles = {
  xs: styles.extraSmallText,
  sm: styles.smallText,
  md: styles.mediumText,
  lg: styles.largeText,
} satisfies Record<PillSize, TextStyle>;

export function Pill({
  label,
  backgroundColor,
  color,
  size = "md",
  animateBackground = false,
  style,
  textStyle,
}: PillProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      style={[
        styles.pill,
        sizeStyles[size],
        {
          backgroundColor,
          transitionProperty: "backgroundColor",
          transitionDuration: animateBackground && !reducedMotion ? 300 : 0,
        },
        style,
      ]}
    >
      <Text style={[styles.text, sizeTextStyles[size], { color }, textStyle]}>{label}</Text>
    </Animated.View>
  );
}
