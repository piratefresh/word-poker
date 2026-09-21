/**
 * rating-card.tsx - the one ask the payoff makes of the player (STO-385, spec section 5).
 *
 * A row of five cumulative chips, a panel of tags and a note behind `Tell us more`, and one
 * Send. Everything the card knows goes out through `@/lib/results-rating`'s `sendResultsRating`
 * - the form has no idea what a fetch is, which is what lets its tests stub the module and
 * assert the exact body a hand would post (see `rating-card.test.tsx`).
 *
 * Two rules shape the state machine:
 *
 *   - A report is never lost to a network. Every keystroke, chip and tag survives a refusal; a
 *     retry re-sends the same report rather than a half-cleared one, which is the only reason a
 *     player would ever try twice.
 *   - A success is final. The card replaced its form with the thanks state, so there is nothing
 *     left to press - the hand is over, and a second report about it would be a second row.
 *
 * The captions follow the pointer and the focus ring rather than the selection, so a player can
 * read what a level means before committing to it; with nothing hovered they fall back to the
 * level the chips are lit to.
 */

import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  border,
  colors,
  fonts,
  fontSize,
  gradients,
  layout,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";
import {
  RATING_NOTE_MAX,
  RATING_TAGS,
  sendResultsRating,
  type RatingTag,
} from "@/lib/results-rating";

/** The five levels, in the order the chips sit: 1 is the roughest hand, 5 the best. */
const RATING_LEVELS = [1, 2, 3, 4, 5] as const;

/**
 * One line per level, printed under the row. They are the card's only copy that follows the
 * pointer, so they are pinned to the levels here rather than looked up anywhere else.
 */
const RATING_CAPTIONS = [
  "Folded \u2014 rough hand",
  "Could be smoother",
  "Solid play",
  "Really enjoyed it",
  "All-in, loved it",
] as const;

/** The chips' diameter in points - the design's 40pt coin, in the felt's dashed cream. */
const CHIP_SIZE = 40;

/** Where the form is: idle until a press, and inert once the server has the report. */
type SendStatus = "idle" | "sending" | "sent" | "failed";

export interface RatingCardProps {
  handNo: number;
  /** The seed the hand was dealt from - what makes a report replayable. */
  seed: number;
}

export function RatingCard({ handNo, seed }: RatingCardProps): ReactElement {
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<readonly RatingTag[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  /** The last chip the pointer or the focus ring touched, or null when neither has one. */
  const [pointed, setPointed] = useState<number | null>(null);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [refusal, setRefusal] = useState<string | null>(null);

  const hasInput = rating !== null || tags.length > 0 || note.trim().length > 0;
  // A sending press is already spent, and a sent card has no Send left to press.
  const canSend = hasInput && (status === "idle" || status === "failed");
  const caption = RATING_CAPTIONS[(pointed ?? rating ?? 0) - 1] ?? "";

  function toggleTag(tag: RatingTag): void {
    // Kept in the tags' own order rather than in the order they were tapped, so the same
    // report reads the same way however the player found it.
    setTags((current) =>
      RATING_TAGS.filter((each) =>
        each === tag ? !current.includes(each) : current.includes(each),
      ),
    );
  }

  async function submit(): Promise<void> {
    if (!canSend) return;
    setStatus("sending");
    setRefusal(null);
    try {
      await sendResultsRating({ handNo, seed, rating, tags, note });
      setStatus("sent");
    } catch (reason) {
      setRefusal(reason instanceof Error ? reason.message : String(reason));
      setStatus("failed");
    }
  }

  if (status === "sent") {
    return (
      <View style={[styles.card, styles.thanksCard]} testID="rating-thanks">
        <LinearGradient {...gradients.goldButton} style={styles.thanksBadge}>
          <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
            <Path
              d="M20 6 9 17l-5-5"
              stroke={colors.onGold}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
            />
          </Svg>
        </LinearGradient>
        <View style={styles.thanksCopy}>
          <Text allowFontScaling style={styles.thanksTitle}>
            {"Noted \u2014 thank you"}
          </Text>
          <Text allowFontScaling style={styles.thanksBody}>
            Your read on this hand is in.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text allowFontScaling style={styles.title}>
        How was this hand?
      </Text>
      <Text allowFontScaling style={styles.eyebrow}>
        Quick one
      </Text>

      <View style={styles.chips}>
        {RATING_LEVELS.map((level) => {
          // Cumulative: the chips up to the level chosen are lit, so the row reads as a level
          // rather than as five independent stars.
          const selected = rating !== null && level <= rating;
          return (
            <Pressable
              accessibilityLabel={`Rate this hand ${level} of 5`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={level}
              onBlur={() => setPointed(null)}
              onFocus={() => setPointed(level)}
              onHoverIn={() => setPointed(level)}
              onHoverOut={() => setPointed(null)}
              onPress={() => setRating(level)}
              style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
              testID={`rating-chip-${level}`}
            >
              {selected ? (
                <LinearGradient
                  {...gradients.goldButton}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Text
                allowFontScaling
                style={[styles.chipNumber, selected && styles.chipNumberOn]}
              >
                {level}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text allowFontScaling style={styles.caption} testID="rating-caption">
        {caption}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={layout.hitSlop}
        onPress={() => setOpen((was) => !was)}
        style={styles.more}
        testID="rating-more"
      >
        <Text allowFontScaling style={styles.moreLabel}>
          Tell us more
        </Text>
        <View style={open && styles.moreGlyphOpen}>
          <Svg fill="none" height={12} viewBox="0 0 12 12" width={12}>
            <Path
              d="M3 4.5 6 7.5 9 4.5"
              stroke={colors.gold}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.6}
            />
          </Svg>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text allowFontScaling style={styles.panelLabel}>
            What stood out?
          </Text>
          <View style={styles.tagRow}>
            {RATING_TAGS.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[styles.tag, selected && styles.tagOn]}
                  testID={`rating-tag-${tag}`}
                >
                  <Text
                    allowFontScaling
                    style={[styles.tagText, selected && styles.tagTextOn]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="What stood out about this hand"
            allowFontScaling
            maxLength={RATING_NOTE_MAX}
            multiline
            onChangeText={(text) => setNote(text.slice(0, RATING_NOTE_MAX))}
            placeholder={"Pacing, scoring, the deal animation, a bug\u2026 anything."}
            placeholderTextColor={colors.textFaint}
            style={styles.note}
            testID="rating-note"
            value={note}
          />
          <Text allowFontScaling style={styles.hint}>
            {"Optional \u2014 helps us tune the next round"}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void submit()}
          style={[styles.send, !canSend && styles.sendOff]}
          testID="rating-send"
        >
          <LinearGradient
            {...gradients.goldButton}
            style={StyleSheet.absoluteFill}
          />
          <Svg fill="none" height={14} viewBox="0 0 24 24" width={14}>
            <Path
              d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
              stroke={colors.onGold}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </Svg>
          <Text allowFontScaling style={styles.sendLabel}>
            Send
          </Text>
        </Pressable>
      </View>

      {refusal !== null ? (
        <Text allowFontScaling style={styles.refusal} testID="rating-error">
          {`Didn't send: ${refusal} Try again.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    padding: spacing.xl,
  },
  title: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
    lineHeight: 30,
  },
  eyebrow: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2.5,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  chips: {
    // Five 40pt chips and their gaps fit the narrowest phone; the row must not fold.
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  chip: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: border.thick,
    height: CHIP_SIZE,
    justifyContent: "center",
    overflow: "hidden",
    width: CHIP_SIZE,
  },
  chipOff: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.textFaint,
    borderStyle: "dashed",
  },
  chipOn: {
    borderColor: colors.goldHi,
    borderStyle: "solid",
  },
  chipNumber: {
    color: colors.textFaint,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.body,
  },
  chipNumberOn: {
    color: colors.onGold,
  },
  caption: {
    color: colors.goldHi,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
    // The line is always held open, so hovering a chip never shifts the panel below it.
    minHeight: spacing.xl,
    marginTop: spacing.md,
  },
  more: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
    alignSelf: "flex-start",
  },
  moreGlyphOpen: {
    transform: [{ rotate: "180deg" }],
  },
  moreLabel: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  panel: {
    marginTop: spacing.lg,
  },
  panelLabel: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tag: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagOn: {
    // A gold wash, drawn from the border ramp so the lit tag needs no colour of its own.
    backgroundColor: colors.border,
    borderColor: colors.borderStrong,
  },
  tagText: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 0.6,
  },
  tagTextOn: {
    color: colors.goldHi,
  },
  note: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    color: colors.textBright,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    marginTop: spacing.lg,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  hint: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  footer: {
    alignItems: "flex-end",
    marginTop: spacing.lg,
  },
  send: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendOff: {
    opacity: opacity.disabled,
  },
  sendLabel: {
    color: colors.onGold,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
  },
  refusal: {
    color: colors.warning,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    marginTop: spacing.md,
    textAlign: "right",
  },
  thanksCard: {
    alignItems: "center",
    flexDirection: "row",
  },
  thanksBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  thanksCopy: {
    flexShrink: 1,
    marginLeft: spacing.md,
  },
  thanksTitle: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.bodyLg,
  },
  thanksBody: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    marginTop: spacing.xxs,
  },
});
