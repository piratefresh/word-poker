/**
 * results-pot.tsx — the number the hand was played for.
 *
 * The count-up is the one thing on this surface React never sees: the pot runs 0 → the amount on
 * the UI thread and is written straight onto an input, because a `setState` per frame would
 * re-render every card under it sixty times a second (STO-384). So the input is the visible layer
 * only. Beneath it an invisible copy of the *final* amount sits in the flow, which does two jobs:
 * it reserves the exact box the settled number will occupy, so the sentence above and the subline
 * below never shift as the digits grow, and it is the recipe's own safety net — the input's
 * `value` starts at the final amount too, so a platform that animates neither prop shows the
 * settled pot rather than an empty box.
 *
 * The updater writes that one number twice — `text` and `value` — and both keys are load-bearing:
 * native paints the input's `text` slot, while the web build renders a DOM input, which holds
 * `value` and has no `text` at all. Neither is a leftover of the other; removing either one stops
 * the count-up on a renderer.
 *
 * Both layers are hidden from the accessibility tree: the headline block is the one node a reader
 * hears, and it carries the pot in its own label. `formatAmount` is called from inside the
 * updater, which is why it carries a `"worklet"` directive — it is one of the few helpers in the
 * app that runs on the UI thread.
 */

import type { ComponentType, ReactElement } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  type AnimatedProps,
  type SharedValue,
} from "react-native-reanimated";

import { colors, fonts, resultsEntrance, spacing } from "@/constants/theme";
import { formatAmount } from "@/lib/format";
import { beatProgress } from "./use-results-entrance";

/**
 * What the count-up layer receives. reanimated writes the counted string onto the input, and
 * neither key it uses is one of `TextInputProps`' animated slots — so the animated component is
 * re-declared with them, instead of taking `createAnimatedComponent`'s mapping of the wrapped
 * component's props, which has no place for `text` at all.
 */
type CountUpProps = AnimatedProps<TextInputProps> & {
  readonly animatedProps?: Partial<{ readonly text: string; readonly value: string }>;
};

const PotValue = Animated.createAnimatedComponent(TextInput) as unknown as ComponentType<
  CountUpProps
>;

export interface ResultsPotProps {
  /** Every chip the hand's pots hold: what the count runs to, and what it settles on. */
  readonly amount: number;
  /** The entrance's shared clock: the count and its lift read two beats of it. */
  readonly clock: SharedValue<number>;
}

export function ResultsPot({ amount, clock }: ResultsPotProps): ReactElement {
  // Read once, on the JS thread: this is the string both layers start from.
  const settled = formatAmount(amount);

  // The beat the pot owns: 0 → the amount, formatted where it is drawn. The two props carry the
  // same number for two renderers — Fabric paints `text` onto the native input, and `value` is
  // the prop react-native-web's own input actually holds — so neither is a leftover to tidy.
  const countUp = useAnimatedProps<{ text: string; value: string }>(() => {
    const formatted = formatAmount(
      Math.round(
        interpolate(
          beatProgress(clock, resultsEntrance.pot, resultsEntrance.count),
          [0, 1],
          [0, amount],
        ),
      ),
    );
    return { text: formatted, value: formatted };
  });

  // The same window as the count: the number reaches its size as it reaches its value.
  const lift = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          beatProgress(clock, resultsEntrance.pot, resultsEntrance.count),
          [0, 1],
          [0.92, 1],
        ),
      },
    ],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box}
    >
      {/* The box: invisible, in the flow, and the exact final amount. */}
      <Text allowFontScaling style={[styles.pot, styles.reserve]} testID="results-pot-reserve">
        {settled}
      </Text>

      {/* The number itself: filled over the box above, so the two line up. */}
      <PotValue
        animatedProps={countUp}
        editable={false}
        style={[styles.pot, styles.layer, lift]}
        testID="results-pot"
        underlineColorAndroid="transparent"
        value={settled}
      />
    </View>
  );
}

/**
 * The pot's type, shared by both layers: whatever is drawn over the box has to break its lines
 * exactly where the invisible copy does, or the reservation means nothing. Tabular figures keep
 * the count-up from jittering as the digits change.
 */
const potType: TextStyle = {
  color: colors.gold,
  fontFamily: fonts.serifBold,
  fontSize: 40,
  fontVariant: ["tabular-nums"],
  letterSpacing: -0.6,
  lineHeight: 48,
  textAlign: "center",
};

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  layer: {
    // Over the box the reserve draws, not beside it: a filled input draws its text where the
    // invisible copy's own line already sits.
    bottom: 0,
    left: 0,
    margin: 0,
    padding: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  pot: potType,
  reserve: { opacity: 0 },
});
