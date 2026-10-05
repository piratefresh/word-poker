import type { JSX } from "react";
import { StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

import { GameButton } from "@/components/ui/game-button";
import { colors } from "@/constants/theme";

import { haptic } from "./haptics";
import { useWordBuilderScope } from "./word-builder";

/**
 * The shuffle, as the felt draws it under the rack (`GameScreen`'s `rackActions`): a small
 * icon button beside the word check, so the word's controls sit with the tiles they act on
 * and the betting rows keep their width. One tap rearranges the tiles the word does
 * not hold, among the places they sit — the draft the seat has built is not something a
 * shuffle should undo, and the seat's own order is otherwise the word's order.
 */
export function WordShuffleButton(): JSX.Element {
  const { canShuffle, shuffle } = useWordBuilderScope();

  return (
    <GameButton
      accessibilityLabel="Shuffle the tiles your word does not hold"
      disabled={!canShuffle}
      onPress={() => {
        haptic("settle");
        shuffle();
      }}
      style={shuffleStyles.button}
      testID="word-builder-shuffle"
    >
      <ShuffleGlyph />
    </GameButton>
  );
}

/** The shuffle, drawn rather than lettered: two paths crossing between the arrowheads. */
function ShuffleGlyph(): JSX.Element {
  return (
    <Svg fill="none" height={18} viewBox="0 0 18 18" width={18}>
      <Path
        d="M2 5h2.2c1.4 0 2.7.7 3.5 1.8l2.6 4.4c.8 1.1 2.1 1.8 3.5 1.8H15"
        stroke={colors.text}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <Path
        d="M2 13h2.2c1.4 0 2.7-.7 3.5-1.8l2.6-4.4C11.1 5.7 12.4 5 13.8 5H15"
        stroke={colors.text}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <Path
        d="m13.3 3.5 1.7 1.5-1.7 1.5M13.3 11.5l1.7 1.5-1.7 1.5"
        stroke={colors.text}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
    </Svg>
  );
}

// The word check's height, so the rack's two word controls read as a pair.
const shuffleStyles = StyleSheet.create({
  button: { height: 32, minWidth: 40, width: 40 },
});
