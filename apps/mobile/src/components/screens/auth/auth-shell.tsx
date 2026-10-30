import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type WithTimingConfig,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import "./autofill-fix";

import { STREETS } from "@/components/screens/home/street-art";
import { fonts, layout, tileMaterial } from "@/constants/theme";

/** The menu card's paper: its own warm palette, not the felt's. */
const paper = {
  ink: "#3a2210",
  body: "#7a5634",
  faint: "#a8967e",
  fieldFill: "#fffdf6",
  fieldBorder: "#dcc196",
  gradient: ["#fff6e2", "#f0dbb2"] as const,
  error: "#a8281e",
  errorBorder: "#c2352b",
  link: "#a8641c",
};

const SCRIM = {
  colors: ["rgba(6,8,22,0.25)", "rgba(6,8,22,0)", "rgba(6,8,22,0.35)", "rgba(6,8,22,0.8)"],
  locations: [0, 0.22, 0.55, 1],
} as const;

const ROWS = ["WORD", "POKER"] as const;
const TILE_WIDTH = 42;
const TILE_HEIGHT = 48;
const TILE_GAP = 5;
/** Each tile's resting lean, in reading order. */
const REST_TILT = [-3, 1, -1, 2, -2, 1, -1, 2, -1];

const DROP_FROM = -180;
/** A tile drops 8° off its resting lean, alternating sides. */
const DROP_TILT = 8;
const DROP_MS = 600;
const DROP_STAGGER_MS = 70;
const DROP_EASING = Easing.bezier(0.3, 1.45, 0.5, 1);
const RISE_EASING = Easing.out(Easing.cubic);
const CARD_RISE = 70;
const CARD_MS = 700;
const CARD_DELAY_MS = 650;
const FOOTER_MS = 400;
const FOOTER_DELAY_MS = 950;

/** Once per app session: moving between the auth screens must not replay it. */
let entryPlayed = false;

function usePlayEntry(): boolean {
  const reduceMotion = useReducedMotion();
  const [play] = useState(() => !entryPlayed && !reduceMotion);
  useEffect(() => {
    if (play) entryPlayed = true;
  }, [play]);
  return play;
}

/** 0 → 1 once, after `delay`; already 1 when the entry doesn't play. */
function useEntryProgress(
  play: boolean,
  delay: number,
  duration: number,
  easing: WithTimingConfig["easing"] = RISE_EASING,
) {
  const progress = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (play) progress.set(withDelay(delay, withTiming(1, { duration, easing })));
  }, [delay, duration, easing, play, progress]);
  return progress;
}

function LogoTile({ letter, index, play }: { letter: string; index: number; play: boolean }) {
  const progress = useEntryProgress(play, index * DROP_STAGGER_MS, DROP_MS, DROP_EASING);
  const rest = REST_TILT[index];
  const from = rest + (index % 2 === 0 ? -DROP_TILT : DROP_TILT);
  const drop = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: Math.min(1, p * 4),
      transform: [{ translateY: DROP_FROM * (1 - p) }, { rotate: `${from + (rest - from) * p}deg` }],
    };
  });
  return (
    <Animated.View
      style={[styles.tile, letter === "K" && styles.tileDouble, drop]}
      testID={`auth-logo-${index}`}
    >
      <Text maxFontSizeMultiplier={1} style={styles.tileLetter}>{letter}</Text>
      <Text maxFontSizeMultiplier={1} style={styles.tilePoints}>{LETTER_VALUES[letter as Letter]}</Text>
    </Animated.View>
  );
}

function AuthLogo({ play }: { play: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel="Word Poker"
      accessibilityRole="header"
      pointerEvents="none"
      style={styles.logo}
      testID="auth-logo"
    >
      {ROWS.map((word, row) => (
        <View aria-hidden key={word} style={styles.logoRow}>
          {[...word].map((letter, col) => (
            <LogoTile
              index={ROWS.slice(0, row).join("").length + col}
              key={`${word}-${col}`}
              letter={letter}
              play={play}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * The street every signed-out screen stands on: the logo, the cream menu card holding the form,
 * and whatever sits under the card. `main-menu-bg` stands in until the closed-door `login-bg.jpg`
 * art lands.
 */
export function AuthShell({
  greeting,
  sub,
  footer,
  children,
}: {
  greeting: string;
  sub: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const play = usePlayEntry();
  const cardIn = useEntryProgress(play, CARD_DELAY_MS, CARD_MS);
  const footerIn = useEntryProgress(play, FOOTER_DELAY_MS, FOOTER_MS);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardIn.get(),
    transform: [{ translateY: CARD_RISE * (1 - cardIn.get()) }],
  }));
  const footerStyle = useAnimatedStyle(() => ({ opacity: footerIn.get() }));

  return (
    <View style={styles.canvas}>
      <StatusBar style="light" />
      <Image contentFit="cover" source={STREETS.portrait.source} style={StyleSheet.absoluteFill} />
      <LinearGradient {...SCRIM} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.frame}>
            <AuthLogo play={play} />
            <Animated.View style={[styles.cardEdge, cardStyle]}>
              <LinearGradient colors={paper.gradient} style={styles.card}>
                <Text accessibilityRole="header" style={styles.greeting}>{greeting}</Text>
                <Text style={styles.sub}>{sub}</Text>
                <View style={styles.form}>{children}</View>
              </LinearGradient>
            </Animated.View>
            {footer ? <Animated.View style={[styles.footer, footerStyle]}>{footer}</Animated.View> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export type FieldProps = TextInputProps & {
  label: string;
  /** Shown under the field after a submit; turns its border red. */
  error?: string;
  /** Standing help under the field, until an error replaces it. */
  hint?: string;
  /** A password: masked, with a SHOW / HIDE toggle on the label's row. */
  secret?: boolean;
  /** Sits under the error: the handle's suggestion chips. */
  children?: ReactNode;
};

export function Field({ label, error, hint, secret = false, children, onBlur, onFocus, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {secret ? (
          <Text
            accessibilityLabel={shown ? "Hide password" : "Show password"}
            accessibilityRole="button"
            onPress={() => setShown(!shown)}
            style={styles.toggle}
          >
            {shown ? "HIDE" : "SHOW"}
          </Text>
        ) : null}
      </View>
      <TextInput
        accessibilityHint={error}
        accessibilityLabel={label}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={paper.faint}
        secureTextEntry={secret && !shown}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError]}
        {...input}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** A small cream tile under a field; tapping it fills the field. */
export function SuggestionChips({ values, onPick }: { values: string[]; onPick: (value: string) => void }) {
  return (
    <View style={styles.chips}>
      {values.map((value) => (
        <Pressable
          accessibilityLabel={`Use ${value}`}
          accessibilityRole="button"
          key={value}
          onPress={() => onPick(value)}
          style={styles.chip}
        >
          <Text style={styles.chipLabel}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Primary gold action; pressing sinks it onto its edge, `pending` locks it and swaps its label. */
export function GoldButton({
  label,
  pendingLabel,
  onPress,
  pending = false,
  lastLogin = false,
}: {
  label: string;
  pendingLabel?: string;
  onPress: () => void;
  pending?: boolean;
  lastLogin?: boolean;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, pending && styles.ctaPending]}
      >
        <LinearGradient colors={["#ffd877", "#e6a73e"]} style={styles.ctaFace}>
          <Text style={styles.ctaLabel}>{pending && pendingLabel ? pendingLabel : label}</Text>
        </LinearGradient>
      </Pressable>
      {lastLogin ? <LastLoginTag /> : null}
    </View>
  );
}

/** Sits on the button's top edge, so showing it never moves the form. */
function LastLoginTag() {
  return (
    <View pointerEvents="none" style={styles.lastLogin}>
      <Text maxFontSizeMultiplier={1} style={styles.lastLoginLabel}>LAST LOGIN</Text>
    </View>
  );
}

/** Dark secondary action on the street, under the card. */
export function Pill({ label, onPress, lastLogin = false }: { label: string; onPress: () => void; lastLogin?: boolean }) {
  return (
    <View style={styles.pillSlot}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.pill}>
        <Text style={styles.pillLabel}>{label}</Text>
      </Pressable>
      {lastLogin ? <LastLoginTag /> : null}
    </View>
  );
}

export function PillRow({ children }: { children: ReactNode }) {
  return <View style={styles.pillRow}>{children}</View>;
}

/** Trailing line that swaps one screen for another. */
export function FooterLine({ text, cta, onPress }: { text: string; cta: string; onPress: () => void }) {
  return (
    <Text style={styles.footerText}>
      {text}{"  "}
      <Text accessibilityRole="link" onPress={onPress} style={styles.footerLink}>{cta}</Text>
    </Text>
  );
}

/** A right-aligned link inside the card. */
export function CardLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="link" onPress={onPress} style={styles.cardLink}>{label}</Text>
  );
}

/** A line inside the card that belongs to no one field. */
export function CardNote({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <Text accessibilityLiveRegion={error ? "polite" : "none"} style={error ? styles.error : styles.note}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: "#060816",
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    alignItems: "center",
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 18,
  },
  /** Frame: full width on a phone, centred and capped on a wide web window. */
  frame: {
    maxWidth: layout.maxContentWidth,
    width: "100%",
  },
  logo: {
    alignItems: "center",
    gap: TILE_GAP,
    marginTop: 24,
  },
  logoRow: {
    flexDirection: "row",
    gap: TILE_GAP,
  },
  tile: {
    alignItems: "center",
    backgroundColor: "#fff6e2",
    borderBottomColor: tileMaterial.slab,
    borderBottomWidth: 4,
    borderRadius: 7,
    boxShadow: "0px 3px 5px rgba(0, 0, 0, 0.35)",
    height: TILE_HEIGHT,
    justifyContent: "center",
    width: TILE_WIDTH,
  },
  tileDouble: {
    backgroundColor: "#a3b483",
    borderBottomColor: "#6b7d4e",
  },
  tileLetter: {
    color: paper.ink,
    fontFamily: fonts.arcade,
    fontSize: 27,
  },
  tilePoints: {
    bottom: 2,
    color: paper.ink,
    fontFamily: fonts.arcade,
    fontSize: 10,
    position: "absolute",
    right: 4,
  },
  cardEdge: {
    borderRadius: 18,
    boxShadow: `0px 6px 0px ${tileMaterial.slab}, 0px 14px 24px rgba(0, 0, 0, 0.45)`,
    marginTop: 27,
  },
  card: {
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  greeting: {
    color: paper.ink,
    fontFamily: fonts.arcade,
    fontSize: 27,
  },
  sub: {
    color: paper.body,
    fontFamily: fonts.rubik,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  form: {
    gap: 12,
    marginTop: 16,
  },
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  fieldLabel: {
    color: paper.body,
    fontFamily: fonts.rubikSemiBold,
    fontSize: 12,
    letterSpacing: 0.96,
    textTransform: "uppercase",
  },
  toggle: {
    color: paper.link,
    fontFamily: fonts.rubikSemiBold,
    fontSize: 12,
    letterSpacing: 0.96,
  },
  input: {
    backgroundColor: paper.fieldFill,
    borderColor: paper.fieldBorder,
    borderRadius: 10,
    borderWidth: 2,
    color: paper.ink,
    fontFamily: fonts.rubikMedium,
    fontSize: 16,
    height: 48,
    paddingHorizontal: 14,
    /**
     * RN's style types only allow solid/dotted/dashed, but web needs `none` to
     * drop the blue UA focus ring, and RN Web hands the value straight to CSS.
     */
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  /** The copper frame carries focus, so the browser's own ring is off. */
  inputFocused: {
    borderColor: tileMaterial.slab,
  },
  inputError: {
    borderColor: paper.errorBorder,
  },
  error: {
    color: paper.error,
    fontFamily: fonts.rubikMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    color: paper.body,
    fontFamily: fonts.rubik,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    color: paper.body,
    fontFamily: fonts.rubik,
    fontSize: 13,
    lineHeight: 18,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: "#fff6e2",
    borderBottomColor: tileMaterial.slab,
    borderBottomWidth: 3,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 10,
  },
  chipLabel: {
    color: paper.ink,
    fontFamily: fonts.arcade,
    fontSize: 14,
  },
  cardLink: {
    alignSelf: "flex-end",
    color: paper.link,
    fontFamily: fonts.arcade,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  cta: {
    borderColor: "#9a5f1c",
    borderRadius: 12,
    borderWidth: 2,
    boxShadow: "0px 5px 0px #8a4f14",
    height: 54,
    marginBottom: 5,
    overflow: "hidden",
  },
  ctaPressed: {
    boxShadow: "0px 2px 0px #8a4f14",
    transform: [{ translateY: 3 }],
  },
  ctaPending: {
    opacity: 0.75,
  },
  ctaFace: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  ctaLabel: {
    color: paper.ink,
    fontFamily: fonts.arcade,
    fontSize: 19,
    letterSpacing: 0.8,
  },
  lastLogin: {
    alignSelf: "center",
    backgroundColor: paper.ink,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    position: "absolute",
    top: -9,
  },
  lastLoginLabel: {
    color: "#ffd877",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  footer: {
    gap: 16,
    marginTop: 18,
  },
  pillRow: {
    flexDirection: "row",
    gap: 10,
  },
  pillSlot: {
    flex: 1,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(6, 8, 22, 0.85)",
    borderColor: "#e0974a",
    borderRadius: 999,
    borderWidth: 3,
    justifyContent: "center",
    minHeight: layout.minTouch + 8,
  },
  pillLabel: {
    color: "#f4e4c1",
    fontFamily: fonts.arcade,
    fontSize: 15,
    letterSpacing: 0.6,
  },
  footerText: {
    color: "#f4e4c1",
    fontFamily: fonts.rubik,
    fontSize: 14,
    textAlign: "center",
  },
  footerLink: {
    color: "#ffd877",
    fontFamily: fonts.arcade,
    fontSize: 15,
    letterSpacing: 0.6,
  },
});
