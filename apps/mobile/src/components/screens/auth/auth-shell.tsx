import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import "./autofill-fix";

import {
  border,
  colors,
  gradients,
  layout,
  opacity,
  radius,
  spacing,
  theme,
} from "@/constants/theme";

const { fonts, fontSize } = theme;
/** `type` is the token group's own name: rename it so it reads as a style set. */
const { type: typography } = theme;

/**
 * The felt canvas every signed-out screen sits on: wordmark, WP mark, and a
 * serif greeting above the form. Sign-in, sign-up, and the password-reset
 * screens share it so they read as one place.
 */
export function AuthShell({
  greeting,
  sub,
  children,
}: {
  greeting: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <LinearGradient {...gradients.felt} style={styles.canvas}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.frame}>
            <View style={styles.header}>
              <Text style={styles.wordmark}>Word Poker</Text>
              <View style={styles.live}>
                <View style={styles.liveDot} />
                <Text style={typography.kicker}>Live</Text>
              </View>
            </View>

            <LinearGradient {...gradients.goldButton} style={styles.mark}>
              <Text style={styles.markInk}>WP</Text>
            </LinearGradient>

            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.sub}>{sub}</Text>

            <View style={styles.form}>{children}</View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

export type FieldProps = TextInputProps & {
  /** Tracked, uppercase caption above the field. */
  label: string;
  /**
   * Mark held in the field's gutter — `@` for an address, the mask for a
   * secret. Fields without one still align: the gutter is the caption's width.
   */
  prefix?: string;
};

export function Field({ label, prefix, onBlur, onFocus, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.input, focused && styles.inputFocused]}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={colors.textFaint}
          style={styles.inputText}
          {...input}
        />
      </View>
    </View>
  );
}

/** Primary gold action; `pending` locks it and swaps in the waiting label. */
export function GoldButton({
  kicker,
  label,
  onPress,
  pending = false,
}: {
  kicker: string;
  label: string;
  onPress: () => void;
  pending?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ctaPress,
        pressed && styles.pressed,
        pending && styles.pending,
      ]}
    >
      <LinearGradient {...gradients.goldButton} style={styles.cta}>
        <Text style={styles.ctaKicker}>{kicker}</Text>
        <Text style={styles.ctaLabel}>{pending ? "Please wait…" : label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Trailing line that swaps one screen for another. */
export function FooterLine({
  text,
  cta,
  onPress,
}: {
  text: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Text style={styles.footer}>
      {text}{" "}
      <Text accessibilityRole="link" onPress={onPress} style={styles.footerLink}>
        {cta} →
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  /** Felt canvas, full bleed: `gradients.felt`. */
  canvas: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xxl,
  },
  /** Frame: full width on a phone, centred and capped on a wide web window. */
  frame: {
    maxWidth: layout.maxContentWidth,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },
  wordmark: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
    letterSpacing: 0.2,
  },
  live: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  mark: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: radius.pill,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  markInk: {
    color: colors.onGold,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.body,
    letterSpacing: 0.5,
  },
  greeting: {
    ...typography.headline,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  sub: {
    ...typography.body,
    color: colors.textDim,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  form: {
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.label,
    textTransform: "uppercase",
  },
  input: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: radius.xs,
    borderWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  /** Gold frame carries focus, so the browser's own ring is off. */
  inputFocused: {
    borderColor: colors.borderStrong,
  },
  inputPrefix: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: fontSize.body,
  },
  inputText: {
    ...typography.body,
    color: colors.textBright,
    flex: 1,
    padding: 0,
    /**
     * RN's style types only allow solid/dotted/dashed, but web needs `none` to
     * drop the blue UA focus ring, and RN Web hands the value straight to CSS.
     */
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  ctaPress: {
    borderRadius: radius.xs,
  },
  cta: {
    alignItems: "center",
    borderRadius: radius.xs,
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  ctaKicker: {
    ...typography.kicker,
    color: colors.onGold,
    lineHeight: fontSize.caption,
  },
  ctaLabel: {
    ...typography.button,
    color: colors.onGold,
    fontSize: fontSize.body,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  pending: {
    opacity: opacity.disabled,
  },
  footer: {
    ...typography.body,
    color: colors.textDim,
    textAlign: "center",
  },
  footerLink: {
    color: colors.gold,
  },
});
