/**
 * game-button.tsx — the table's struck button: a face of material sitting on a darker lip.
 *
 * The face is a few quiet layers over the variant's colour, all of them views rather than a Skia
 * canvas: every canvas on the web is its own WebGL context, and the felt already spends several
 * (the backdrop, the table art, the timer glass, the seat beams), so a row of six more would
 * run the browser into its context cap. Views do the whole job here:
 *
 *   1. a vertical gradient — light at the top, the variant's body in the middle, dark at the foot;
 *   2. a hair of light along the top edge and a soft sheen over the upper half;
 *   3. a darker band along the foot: the inner bevel;
 *   4. on the secondary slabs (`dark`, `danger`), a hairline frame set just inside the edge.
 *
 * Under the face sits the lip, three points of the variant's shadow colour. A press sinks the face
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

import {
  border,
  colors,
  fonts,
  opacity,
  palette,
  radius,
} from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

export type GameButtonVariant = "gold" | "dark" | "danger" | "blue";

export interface GameButtonProps {
  /** The printed label. Omit it for an icon button and pass the icon as `children`. */
  label?: string;
  /** A figure printed large above the label (already formatted, e.g. "$1.2K"). */
  amount?: string;
  /** An icon (or anything else) drawn in place of the label. */
  children?: ReactNode;
  onPress?: () => void;
  /**
   * `gold` is the table's call to action (bet, raise, all in, confirm); `dark` is every other
   * control; `danger` is the dark button with a red edge — the one that gives something up;
   * `blue` is the quiet answer (check, call).
   */
  variant?: GameButtonVariant;
  disabled?: boolean;
  /** Grows the button's height, padding and lettering; 1 is the phone's size. */
  scale?: number;
  /** The small-screen size: 44 tall (still a full touch target) with a 10-point label. */
  compact?: boolean;
  /** Space on each side of the face's content, before screen scaling. */
  horizontalPadding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/** How far the face stands off its lip, and how far a press sinks it. */
const LIP = 5;
const PRESS_DEPTH = 2;
/** How far inside the face's edge the slab's inner frame is drawn. */
const FRAME_INSET = 3;

interface Material {
  /** Top to foot. */
  gradient: readonly [string, string, string];
  lip: string;
  edge: string;
  ink: string;
  highlight: string;
  sheen: string;
  bevel: string;
  inkShadow: string;
  /** A hairline set a few points inside the edge: the slab's double frame. */
  frame?: string;
}

const MATERIALS: Record<GameButtonVariant, Material> = {
  gold: {
    gradient: [palette.gold100, palette.gold300, palette.gold500],
    lip: "#4a3508",
    edge: palette.gold200,
    ink: colors.onGold,
    highlight: "rgba(255,248,220,0.7)",
    sheen: "rgba(255,255,255,0.22)",
    bevel: "rgba(74,53,8,0.45)",
    inkShadow: "rgba(255,240,200,0.45)",
  },
  // The secondary: a charcoal slab, near flat, framed twice — a black edge and a pale hairline
  // just inside it — with the label set bright. It recedes beside the gold without going muddy.
  dark: {
    gradient: ["#2a2c2b", "#212322", "#1a1c1b"],
    lip: "#050605",
    edge: "#0b0c0b",
    ink: colors.textBright,
    highlight: "rgba(255,255,255,0.06)",
    sheen: "rgba(255,255,255,0.03)",
    bevel: "rgba(0,0,0,0.35)",
    inkShadow: "rgba(0,0,0,0.85)",
    frame: "rgba(255,255,255,0.16)",
  },
  // The control that gives something up: a struck red slab, same build as `gold`.
  danger: {
    gradient: ["#e8897c", "#b23a2c", "#7a2018"],
    lip: "#3a0f09",
    edge: "#c9493a",
    ink: colors.textBright,
    highlight: "rgba(255,230,220,0.5)",
    sheen: "rgba(255,255,255,0.18)",
    bevel: "rgba(58,15,9,0.45)",
    inkShadow: "rgba(0,0,0,0.6)",
  },
  blue: {
    gradient: ["#7fb0ee", "#2f6bc4", "#1d4688"],
    lip: "#0c2147",
    edge: "#5b92dd",
    ink: colors.textBright,
    highlight: "rgba(220,235,255,0.5)",
    sheen: "rgba(255,255,255,0.18)",
    bevel: "rgba(12,33,71,0.45)",
    inkShadow: "rgba(0,0,0,0.6)",
  },
};

export function GameButton({
  label,
  amount,
  children,
  onPress,
  variant = "dark",
  disabled = false,
  scale = 1,
  compact = false,
  horizontalPadding = 12,
  style,
  testID,
  accessibilityLabel,
}: GameButtonProps): ReactElement {
  const material = MATERIALS[variant];
  // A pointer over the button lifts the sheen; a finger never hovers, so this is the web's alone.
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityLabel={
        accessibilityLabel ??
        (amount === undefined ? label : `${label ?? ""} ${amount}`.trim())
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
        scale !== 1 && { height: 50 * scale, minWidth: 48 * scale },
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
              {
                borderColor: material.edge,
                // The bevel: a bright rim along the top, a soft shade pooling at the foot.
                boxShadow: sunk
                  ? `inset 0px 3px 5px ${material.bevel}`
                  : `inset 0px 2px 0px ${material.highlight}, inset 0px -4px 5px ${material.bevel}`,
              },
              { paddingHorizontal: horizontalPadding * scale },
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
            <LinearGradient
              colors={[
                hovered && !disabled
                  ? brighten(material.sheen)
                  : material.sheen,
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
              style={[styles.bevel, { backgroundColor: material.bevel }]}
            />
            {material.frame === undefined ? null : (
              <View
                pointerEvents="none"
                style={[
                  styles.frame,
                  {
                    borderColor:
                      hovered && !disabled
                        ? brighten(material.frame)
                        : material.frame,
                  },
                  scale !== 1 && { margin: FRAME_INSET * scale },
                ]}
              />
            )}
            {/* The content has a view of its own so it stacks above the layers: on the web a
                bare svg icon is unpositioned and would paint under them. */}
            <View
              style={[
                styles.content,
                amount !== undefined && styles.contentStacked,
              ]}
            >
              {children}
              {amount === undefined ? null : (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.amount,
                    scale !== 1 && { fontSize: 16 * scale },
                    {
                      color: material.ink,
                      textShadowColor: material.inkShadow,
                    },
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
                    {
                      color: material.ink,
                      textShadowColor: material.inkShadow,
                    },
                  ]}
                >
                  {label}
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
  return rgba.replace(
    /[\d.]+\)$/,
    (alpha) => `${Math.min(1, parseFloat(alpha) * 2)})`,
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    boxShadow: "0px 3px 5px rgba(0,0,0,0.45)",
    height: 50,
    minWidth: 48,
  },
  buttonCompact: { height: 46, minWidth: 44 },
  labelCompact: { fontSize: 10 },
  disabled: { opacity: opacity.disabled },
  face: {
    alignItems: "center",
    borderRadius: radius.md,
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
    fontFamily: fonts.monoBold,
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
  highlight: {
    borderRadius: radius.pill,
    height: border.hairline,
    left: 3,
    position: "absolute",
    right: 3,
    top: 1,
  },
  highlightSunk: { opacity: 0.35 },
  frame: {
    ...StyleSheet.absoluteFill,
    borderRadius: 2,
    borderWidth: border.hairline,
    margin: FRAME_INSET,
  },
  bevel: {
    bottom: 0,
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
  },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
