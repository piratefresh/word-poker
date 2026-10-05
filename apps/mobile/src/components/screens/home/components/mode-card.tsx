import {
  Column,
  Row,
  Text,
  type UniversalStyle,
  type UniversalTextStyle,
} from "@expo/ui";
import type { ReactNode } from "react";

import { border, colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

export type ModeTone = "default" | "recommended" | "warm";

export type ModeCardProps = {
  /** Emoji or short glyph shown in the leading slot. */
  glyph: string;
  label: string;
  description: string;
  /** Small stamp pinned above the card (e.g. "Recommended"). */
  badge?: string;
  tone?: ModeTone;
  disabled?: boolean;
  onSelect?: () => void;
  /** The card's outer width in points; SwiftUI ignores a percentage. */
  width: number;
  /**
   * The mode's own choices, under its header (e.g. Offline's Normal | Wild Power). A card that
   * carries them is not pressed itself: the choices are.
   */
  children?: ReactNode;
};

type Surface = { backgroundColor: string; borderColor: string };

const surfaces: Record<ModeTone, Surface> = {
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  recommended: { backgroundColor: colors.gold, borderColor: colors.goldHi },
  warm: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
};

/** Recommended cards sit on gold, so their ink flips dark. */
function inkFor(tone: ModeTone) {
  return tone === "recommended"
    ? { label: colors.onGold, description: colors.onTile }
    : { label: colors.textBright, description: colors.textDim };
}

export function ModeCard({
  glyph,
  label,
  description,
  badge,
  tone = "default",
  disabled = false,
  onSelect,
  width,
  children,
}: ModeCardProps) {
  const ink = inkFor(tone);

  const cardStyle: UniversalStyle = {
    ...surfaces[tone],
    borderRadius: radius.card,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    opacity: disabled ? 0.55 : 1,
    width,
  };
  // The frame wraps the padding, so the rows inside get the width less both gutters.
  const innerWidth = width - spacing.lg * 2;

  const labelText: UniversalTextStyle = {
    color: ink.label,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
  };

  const descText: UniversalTextStyle = {
    color: ink.description,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 18,
  };

  const glyphText: UniversalTextStyle = {
    color: ink.label,
    fontSize: fontSize.h3,
  };

  const badgePill: UniversalStyle = {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  };

  const badgeText: UniversalTextStyle = {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
  };

  return (
    <Column
      disabled={disabled}
      onPress={disabled || children ? undefined : onSelect}
      spacing={badge || children ? spacing.md : spacing.none}
      style={cardStyle}
    >
      {badge ? (
        <Row style={{ width: innerWidth }}>
          <Row alignment="center" style={badgePill}>
            <Text textStyle={badgeText}>{badge.toUpperCase()}</Text>
          </Row>
        </Row>
      ) : null}
      <Row
        alignment="center"
        spacing={spacing.md}
        style={{ width: innerWidth }}
      >
        <Text textStyle={glyphText}>{glyph}</Text>
        <Column spacing={spacing.xxs}>
          <Text textStyle={labelText}>{label}</Text>
          <Text textStyle={descText}>{description}</Text>
        </Column>
      </Row>
      {children}
    </Column>
  );
}
