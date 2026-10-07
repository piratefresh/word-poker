/**
 * game-button.tsx — the table's struck button: a face of material sitting on a darker lip.
 *
 * The face is a few quiet layers over the variant's colour, all of them views rather than a Skia
 * canvas: every canvas on the web is its own WebGL context, and the felt already spends several
 * (the backdrop, the table art, the timer glass, the seat beams), so a row of six more would
 * run the browser into its context cap. Views do the whole job here:
 *
 *   1. a vertical gradient — light at the top, the variant's body in the middle, dark at the foot;
 *   2. the bevel: a dark outline, then a raised rim round the face in the variant's lighter edge
 *      colour, so the face reads as sitting inside a moulded border;
 *   3. the gloss: a soft sheen over the upper half, a bright specular line just inside the rim at
 *      the top, and a faint light line at the foot where the lip's bounce catches the face;
 *   4. on the secondary slabs (`dark`), a hairline frame set just inside the rim.
 *
 * Under the face sits the lip, five points of the variant's shadow colour. A press sinks the face
 * into it — the lip closes and the label goes down with the face — which is what makes the button
 * read as a physical control rather than a lit rectangle.
 *
 * Layout is the caller's: the button is its label's width and 48 points tall unless `style` says
 * otherwise, so a row that shares its width passes `flex` and a lone control needs nothing.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactElement, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { border, colors, fonts, opacity, radius } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

export type GameButtonVariant = "gold" | "dark" | "danger" | "blue" | "green";

export interface GameButtonProps {
  /** The printed label. Omit it for an icon button and pass the icon as `children`. */
  label?: string;
  /**
   * Printed after the label in the material's accent colour — the count in "CHECK WORD 5/5".
   * A material without an accent prints it in the label's own ink.
   */
  labelAccent?: string;
  /** A figure printed large above the label (already formatted, e.g. "$1.2K"). */
  amount?: string;
  /** An icon (or anything else) drawn in place of the label. */
  children?: ReactNode;
  onPress?: () => void;
  /**
   * `gold` is the table's call to action (raise, bet, all in); `blue` is the call; `danger` is
   * the red that gives something up (fold); `green` is the word's check; `dark` is every other
   * control.
   */
  variant?: GameButtonVariant;
  disabled?: boolean;
  /** Grows the button's height, padding and lettering; 1 is the phone's size. */
  scale?: number;
  /** The small-screen size: 44 tall (still a full touch target) with a 10-point label. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/** How far the face stands off its lip, and how far a press sinks it. */
const LIP = 5;
const PRESS_DEPTH = 3;
/** The raised rim round the face: its width, which the gloss lines sit just inside. */
const RIM = 3;
/** How far inside the face's edge the slab's inner frame is drawn. */
const FRAME_INSET = RIM + 2;

interface Material {
  /** Top to foot. */
  gradient: readonly [string, string, string];
  /** The shadow colour under the face, and the dark outline round it. */
  lip: string;
  /** The raised rim round the face: lighter than the body, so it catches the light. */
  edge: string;
  ink: string;
  /** The specular line along the top, inside the rim; its light also tints the foot's line. */
  highlight: string;
  sheen: string;
  inkShadow: string;
  /** A hairline set a few points inside the rim: the slab's double frame. */
  frame?: string;
  /** The tint `labelAccent` prints in. */
  accent?: string;
}

// The colours are sampled off the tabletop reference (STO-538): the face's body, the lip and
// outline under it, and the lighter rim round it. The reference's face barely shades — its
// gloss is in the rim and the specular lines — so the gradient's head and foot sit close to the
// body.
const MATERIALS: Record<GameButtonVariant, Material> = {
  gold: {
    gradient: ["#ffd04a", "#fec53a", "#f2ab25"],
    lip: "#b45f06",
    edge: "#ffdc6e",
    ink: "#3b2406",
    highlight: "rgba(255,250,225,0.9)",
    sheen: "rgba(255,255,255,0.24)",
    inkShadow: "rgba(255,240,200,0.45)",
  },
  blue: {
    gradient: ["#2a82ea", "#1071dc", "#0c62c0"],
    lip: "#013b85",
    edge: "#4a9cf5",
    ink: "#ffffff",
    highlight: "rgba(225,240,255,0.85)",
    sheen: "rgba(255,255,255,0.2)",
    inkShadow: "rgba(0,28,70,0.7)",
  },
  green: {
    gradient: ["#0f7a3d", "#0b6b36", "#08592c"],
    lip: "#013a17",
    edge: "#2f9a5c",
    ink: "#ffffff",
    highlight: "rgba(215,255,230,0.8)",
    sheen: "rgba(255,255,255,0.18)",
    inkShadow: "rgba(0,32,12,0.7)",
    accent: "#f5d547",
  },
  // The secondary: a charcoal slab, near flat, with a lighter charcoal rim and a pale hairline
  // just inside it, the label set bright. It recedes beside the gold without going muddy.
  dark: {
    gradient: ["#2d2f36", "#24252a", "#1c1d22"],
    lip: "#0b0b0e",
    edge: "#3c3e46",
    ink: colors.textBright,
    highlight: "rgba(255,255,255,0.14)",
    sheen: "rgba(255,255,255,0.04)",
    inkShadow: "rgba(0,0,0,0.85)",
    frame: "rgba(255,255,255,0.12)",
  },
  // The control that gives something up: a struck red slab, same build as `gold`.
  danger: {
    gradient: ["#e0283a", "#d31f2f", "#bf1127"],
    lip: "#790112",
    edge: "#f0414d",
    ink: "#ffffff",
    highlight: "rgba(255,215,213,0.9)",
    sheen: "rgba(255,255,255,0.2)",
    inkShadow: "rgba(60,0,8,0.7)",
  },
};

export function GameButton({
  label,
  labelAccent,
  amount,
  children,
  onPress,
  variant = "dark",
  disabled = false,
  scale = 1,
  compact = false,
  style,
  testID,
  accessibilityLabel,
}: GameButtonProps): ReactElement {
  const material = MATERIALS[variant];
  // A pointer over the button lifts the sheen; a finger never hovers, so this is the web's alone.
  const [hovered, setHovered] = useState(false);
  const printed =
    labelAccent === undefined ? label : `${label ?? ""} ${labelAccent}`.trim();

  return (
    <Pressable
      accessibilityLabel={
        accessibilityLabel ??
        (amount === undefined ? printed : `${printed ?? ""} ${amount}`.trim())
      }
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: material.lip },
        scale !== 1 && { height: 48 * scale, minWidth: 48 * scale },
        compact && styles.buttonCompact,
        disabled && styles.disabled,
        style,
      ]}
      // The label is a control's name, not its address: a web flow reaches for the test id
      // (webTestID), because the label changes with the state the button describes.
      id={webTestID(testID)}
      testID={testID}
    >
      {({ pressed }) => {
        const sunk = pressed && !disabled;
        return (
          <View
            style={[
              styles.face,
              { borderColor: material.lip },
              scale !== 1 && { paddingHorizontal: 12 * scale },
              sunk ? styles.faceSunk : styles.faceUp,
            ]}
          >
            <LinearGradient
              colors={material.gradient}
              end={{ x: 0.5, y: 1 }}
              pointerEvents="none"
              start={{ x: 0.5, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[styles.rim, { borderColor: material.edge }]}
            />
            <LinearGradient
              colors={[
                hovered && !disabled ? brighten(material.sheen) : material.sheen,
                "rgba(255,255,255,0)",
              ]}
              end={{ x: 0.5, y: 1 }}
              pointerEvents="none"
              start={{ x: 0.5, y: 0 }}
              style={styles.sheen}
            />
            <View
              pointerEvents="none"
              style={[
                styles.highlight,
                { backgroundColor: material.highlight },
                sunk && styles.highlightSunk,
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.glint,
                { backgroundColor: material.highlight },
                sunk && styles.highlightSunk,
              ]}
            />
            {material.frame === undefined ? null : (
              <View
                pointerEvents="none"
                style={[
                  styles.frame,
                  {
                    borderColor:
                      hovered && !disabled ? brighten(material.frame) : material.frame,
                  },
                  scale !== 1 && { margin: FRAME_INSET * scale },
                ]}
              />
            )}
            {/* The content has a view of its own so it stacks above the layers: on the web a
                bare svg icon is unpositioned and would paint under them. */}
            <View style={[styles.content, amount !== undefined && styles.contentStacked]}>
              {children}
              {amount === undefined ? null : (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.amount,
                    scale !== 1 && { fontSize: 16 * scale },
                    { color: material.ink, textShadowColor: material.inkShadow },
                  ]}
                >
                  {amount}
                </Text>
              )}
              {label === undefined ? null : (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    amount !== undefined && styles.labelSecondary,
                    compact && amount === undefined && styles.labelCompact,
                    scale !== 1 && {
                      fontSize: (amount === undefined ? 11 : 10) * scale,
                      letterSpacing: 1.2 * scale,
                    },
                    { color: material.ink, textShadowColor: material.inkShadow },
                  ]}
                >
                  {label}
                  {labelAccent === undefined ? null : (
                    <Text style={material.accent === undefined ? undefined : { color: material.accent }}>
                      {` ${labelAccent}`}
                    </Text>
                  )}
                </Text>
              )}
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

/** Doubles an rgba colour's alpha — the hover's lift of the sheen. */
function brighten(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, (alpha) => `${Math.min(1, parseFloat(alpha) * 2)})`);
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.sm + 2,
    height: 48,
    minWidth: 48,
  },
  buttonCompact: { height: 44, minWidth: 44 },
  labelCompact: { fontSize: 10 },
  disabled: { opacity: opacity.disabled },
  face: {
    alignItems: "center",
    borderRadius: radius.sm + 2,
    borderWidth: border.hairline,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 12,
  },
  content: { alignItems: "center", flexDirection: "row", gap: 6 },
  /** An amount over its action: the number leads, the label sits under it. */
  contentStacked: { flexDirection: "column", gap: 0 },
  amount: {
    fontFamily: fonts.arcade,
    fontSize: 16,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  labelSecondary: { fontSize: 10, letterSpacing: 1 },
  /** At rest the face stands on the lip; the lip shows as a dark band at its foot. */
  faceUp: { marginBottom: LIP },
  /** Pressed, the face sinks: the band closes and the whole face — label too — moves down. */
  faceSunk: { marginBottom: LIP - PRESS_DEPTH, marginTop: PRESS_DEPTH },
  sheen: {
    height: "50%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  /** The raised rim round the face: a border of the material's lighter edge colour. */
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.sm + 1,
    borderWidth: RIM,
  },
  /** The bright specular line along the top, just inside the rim. */
  highlight: {
    borderRadius: radius.pill,
    height: 2,
    left: RIM + 3,
    position: "absolute",
    right: RIM + 3,
    top: RIM - 1,
  },
  /** The faint light line along the foot, just inside the rim. */
  glint: {
    borderRadius: radius.pill,
    bottom: RIM - 1,
    height: border.hairline,
    left: RIM + 3,
    opacity: 0.45,
    position: "absolute",
    right: RIM + 3,
  },
  highlightSunk: { opacity: 0.35 },
  frame: {
    ...StyleSheet.absoluteFill,
    borderRadius: 2,
    borderWidth: border.hairline,
    margin: FRAME_INSET,
  },
  label: {
    fontFamily: fonts.arcade,
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
