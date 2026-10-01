/**
 * mode-variants.tsx — the two-up choice inside a mode card (Offline: Normal | Wild Power).
 *
 * The pair is drawn in React Native, hosted in the universal card (`RNHostView`): the universal
 * layout has no image and no flex, and the two tiles have to share the row evenly and carry art.
 */

import { Image, type ImageSource } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { border, colors, fonts, fontSize, glow, radius, spacing } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

export type ModeVariantTone = "plain" | "featured";

export type ModeVariant = {
  key: string;
  label: string;
  description: string;
  art: ImageSource;
  /** A featured variant sits on a gold rim, as the new or special way to play. */
  tone?: ModeVariantTone;
  testID?: string;
};

type ModeVariantsProps<V extends ModeVariant> = {
  variants: readonly V[];
  disabled?: boolean;
  onSelect: (variant: V) => void;
};

const ART_SIZE = 56;

export function ModeVariants<V extends ModeVariant>({
  variants,
  disabled = false,
  onSelect,
}: ModeVariantsProps<V>) {
  return (
    <View style={styles.row}>
      {variants.map((variant) => {
        const featured = variant.tone === "featured";
        return (
          <Pressable
            key={variant.key}
            accessibilityLabel={`${variant.label}: ${variant.description}`}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            id={webTestID(variant.testID)}
            onPress={() => onSelect(variant)}
            style={({ pressed }) => [
              styles.tile,
              featured ? styles.featured : styles.plain,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
            testID={variant.testID}
          >
            <Image
              accessible={false}
              contentFit="contain"
              source={variant.art}
              style={styles.art}
            />
            <Text style={styles.label}>{variant.label}</Text>
            <Text style={[styles.description, featured && styles.featuredDescription]}>
              {variant.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.md,
  },
  tile: {
    alignItems: "center",
    borderRadius: radius.lg,
    flex: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  plain: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: border.thin,
  },
  featured: {
    backgroundColor: "rgba(212,165,74,0.12)",
    borderColor: colors.gold,
    borderWidth: border.thick,
    ...glow(colors.gold, 10),
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
  art: {
    height: ART_SIZE,
    width: ART_SIZE,
  },
  label: {
    color: colors.textBright,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    textAlign: "center",
  },
  description: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 18,
    textAlign: "center",
  },
  featuredDescription: {
    color: colors.gold,
  },
});
