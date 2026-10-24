import type { JSX } from "react";

import { useScreenScale } from "@/components/screens/game/screen-scale";

import { haptic } from "./haptics";
import { RackPill } from "./rack-pill";
import { useWordBuilderScope } from "./word-builder";

/**
 * The shuffle, as the felt draws it under the rack (`GameScreen`'s `rackActions`): a pill beside
 * the word check, so the word's controls sit with the tiles they act on and the betting rows
 * keep their width. One tap rearranges the tiles the word does not hold, among the places they
 * sit — the draft the seat has built is not something a shuffle should undo, and the seat's own
 * order is otherwise the word's order.
 */
export function WordShuffleButton(): JSX.Element {
  const { canShuffle, shuffle } = useWordBuilderScope();
  const scale = useScreenScale();

  return (
    <RackPill
      accessibilityLabel="Shuffle the tiles your word does not hold"
      disabled={!canShuffle}
      label="SHUFFLE"
      onPress={() => {
        haptic("settle");
        shuffle();
      }}
      scale={scale}
      testID="word-builder-shuffle"
    />
  );
}
