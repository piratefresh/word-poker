/**
 * results-headline.tsx — the sentence the hand ends on, and the pot under it.
 *
 * The three pieces arrive built (§1): the view never joins a sentence of its own, it puts the lead
 * and the emphasis on one line and leaves the emphasis in the one gold italic run the design gives
 * it (STO-379 decision 12). The pot is `ResultsPot`, which counts itself up on its own beat of the
 * same clock.
 *
 * The block is a single accessibility node: a reader hears `Ellis takes the pot, $80 pot, …` once,
 * from the container, and the four texts inside it — the count-up's two layers included — are
 * hidden from the tree. Read as they are, they would arrive as five fragments, in an order nobody
 * wrote, with the pot republishing its digits sixty times a second as the entrance runs.
 */

import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, fonts, fontSize, resultsEntrance, spacing } from "@/constants/theme";
import { formatAmount } from "@/lib/format";
import { beatProgress } from "@/lib/use-results-entrance";

import { ResultsPot } from "./results-pot";
import type { ResultsSnapshot } from "./results-types";

/** The block's own label; the sentence below it is the hand's. */
const EYEBROW = "HEADLINE · RESULTS";

export interface ResultsHeadlineProps {
  /** The settled hand: its headline pieces, and the pot the count settles on. */
  readonly snapshot: ResultsSnapshot;
  /** The entrance's shared clock: the sentence and the pot each read a beat of it. */
  readonly clock: SharedValue<number>;
}

export function ResultsHeadlineView({ snapshot, clock }: ResultsHeadlineProps): ReactElement {
  const { emphasis, lead, subline } = snapshot.headline;
  const label = `${lead} ${emphasis}, ${formatAmount(snapshot.pot)} pot, ${subline}`;

  // The eyebrow and the sentence enter as one block: they are one thought, and two rises would
  // read as two lines arriving at different times.
  const enter = useAnimatedStyle(() => {
    const progress = beatProgress(clock, resultsEntrance.headline, resultsEntrance.rise);

    return {
      opacity: progress,
      transform: [{ translateY: interpolate(progress, [0, 1], [10, 0]) }],
    };
  });

  return (
    <View accessibilityLabel={label} accessibilityRole="header" accessible style={styles.block}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.content}
      >
        <Animated.View style={enter}>
          <Text allowFontScaling style={styles.eyebrow}>
            {EYEBROW}
          </Text>

          <Text allowFontScaling style={styles.sentence}>
            {`${lead} `}
            <Text allowFontScaling style={styles.emphasis}>
              {emphasis}
            </Text>
          </Text>
        </Animated.View>

        <ResultsPot amount={snapshot.pot} clock={clock} />

        <Text allowFontScaling style={styles.subline}>
          {subline}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "center" },
  content: { alignItems: "center" },
  // The sentence's one gold run: the same colour as the pot, in the italic serif.
  emphasis: {
    color: colors.gold,
    fontFamily: fonts.serifBoldItalic,
  },
  eyebrow: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2.4,
    textAlign: "center",
  },
  sentence: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 32,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  // Already uppercase: the copy is the only thing that decides its case.
  subline: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.4,
    marginTop: spacing.xxs,
    textAlign: "center",
  },
});
