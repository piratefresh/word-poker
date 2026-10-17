/**
 * coach-card.tsx — the coach's speech card: a stamp, a lettered badge, a title, the copy, the
 * tour's progress and its controls. Carried over from the MVP's onboarding card
 * (four-in-a-row `OnboardingCard`): cream on the felt, a gold heel, mono stamps.
 *
 * Every card offers Previous (Close on the first step, when the caller can close) and Next —
 * Finish on the last — except on a step that waits for the player to do the thing it teaches,
 * where Next is withheld and the caller advances it. A **coach** card is a step of the lesson
 * and also counts `n/N` and draws the progress bar; a **helper** card is the felt's "How to play"
 * tour, which the player opened and can leave at any step.
 *
 * Presentational only: which step it is and what the buttons do are the caller's.
 */

import { Image, type ImageSource } from "expo-image";
import { type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { webTestID } from "@/lib/ui/web-id";
import { border, colors, elevation, fonts, fontSize, opacity, palette, radius, spacing } from "@/constants/theme";

export type CoachKind = "coach" | "helper";

/**
 * A step's clip: a bundled asset (`require` of a GIF) and the width-to-height ratio it was
 * recorded at, so the card holds its place before the first frame decodes.
 */
export interface CoachMedia {
  source: ImageSource | number;
  aspectRatio: number;
  /** What the clip shows, for a screen reader. */
  label: string;
}

export interface CoachCardProps {
  kind: CoachKind;
  /** The badge's letter or number; omitted, the title sits alone. */
  icon?: string;
  title: string;
  body: ReactNode;
  /** 0-based. */
  index: number;
  total: number;
  /** Whether the step advances on Next, or waits for the player's own action. */
  advance: "next" | "action";
  media?: CoachMedia;
  onNext?: () => void;
  onPrevious?: () => void;
  onClose?: () => void;
}

export function CoachCard({
  kind,
  icon,
  title,
  body,
  media,
  index,
  total,
  advance,
  onNext,
  onPrevious,
  onClose,
}: CoachCardProps): ReactElement {
  const coach = kind === "coach";
  const last = index >= total - 1;
  const progress = total > 0 ? (index + 1) / total : 0;

  return (
    <View
      accessibilityLabel={`${coach ? "Coach" : "Helper"}: ${title}`}
      aria-live="polite"
      id={webTestID("coach-card")}
      style={styles.card}
      testID="coach-card"
    >
      <View style={styles.stampRow}>
        <Text style={styles.stamp}>{coach ? "COACH" : "HELPER"}</Text>
        {coach ? (
          <Text style={[styles.stamp, styles.stampCount]} testID="coach-count">
            {`${index + 1}/${total}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.titleRow}>
        {icon ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{icon}</Text>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>

      {media === undefined ? null : (
        <Image
          accessibilityLabel={media.label}
          autoplay
          contentFit="cover"
          source={media.source}
          style={[styles.media, { aspectRatio: media.aspectRatio }]}
          testID="coach-media"
        />
      )}

      {typeof body === "string" ? <Text style={styles.body}>{body}</Text> : body}

      {coach ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      <View style={styles.controls}>
        {index > 0 && onPrevious ? (
          <CoachButton label="Previous" onPress={onPrevious} testID="coach-previous" tone="quiet" />
        ) : onClose ? (
          <CoachButton label="Close" onPress={onClose} testID="coach-close" tone="quiet" />
        ) : (
          <View style={styles.slot} />
        )}
        <Text style={styles.footer}>{`${index + 1} of ${total}`}</Text>
        {advance === "next" && onNext ? (
          <CoachButton
            label={last ? "Finish" : "Next"}
            onPress={onNext}
            testID="coach-next"
            tone={last ? "felt" : "gold"}
          />
        ) : (
          <View style={styles.slot} />
        )}
      </View>
    </View>
  );
}

function CoachButton({
  label,
  onPress,
  testID,
  tone,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  tone: "gold" | "felt" | "quiet";
}): ReactElement {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "gold" ? styles.buttonGold : tone === "felt" ? styles.buttonFelt : styles.buttonQuiet,
        pressed && { opacity: opacity.pressed },
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.buttonText,
          { color: tone === "gold" ? colors.onGold : tone === "felt" ? colors.textBright : INK_SOFT },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const INK = palette.tileInk;
const INK_SOFT = "rgba(43,24,16,0.7)";

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    backgroundColor: palette.cream100,
    borderBottomColor: palette.gold400,
    borderBottomWidth: 3,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  stampRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  stamp: {
    color: palette.gold500,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.micro,
    letterSpacing: 1.8,
  },
  stampCount: {
    opacity: 0.8,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  badge: {
    alignItems: "center",
    backgroundColor: palette.gold400,
    borderRadius: radius.xs,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  badgeText: {
    color: colors.onGold,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
  title: {
    color: INK,
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
  },
  media: {
    backgroundColor: palette.felt500,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    width: "100%",
  },
  body: {
    color: INK,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  track: {
    backgroundColor: "rgba(43,24,16,0.1)",
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: palette.gold400,
    borderRadius: radius.pill,
    height: 4,
  },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  slot: {
    minHeight: 32,
    minWidth: 76,
  },
  footer: {
    color: "rgba(43,24,16,0.45)",
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  button: {
    alignItems: "center",
    borderRadius: radius.xs,
    borderWidth: border.hairline,
    justifyContent: "center",
    minHeight: 32,
    minWidth: 76,
    paddingHorizontal: spacing.md,
  },
  buttonGold: {
    backgroundColor: palette.gold400,
    borderColor: palette.gold200,
  },
  buttonFelt: {
    backgroundColor: palette.felt500,
    borderColor: palette.felt400,
  },
  buttonQuiet: {
    backgroundColor: "transparent",
    borderColor: "rgba(43,24,16,0.15)",
  },
  buttonText: {
    fontFamily: fonts.monoBold,
    fontSize: fontSize.micro,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
