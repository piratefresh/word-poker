import type { LetterMultiplier } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { View } from "react-native";

import { Tile, TILE_METRICS } from "@/components/game/word-tile";

const SIZES = {
  lg: 28,
  md: 26,
  sm: 18,
} as const;

export function MiniTile({ letter, size = "md", tone = "cream", opacity = 1, multiplier }: {
  letter: Letter;
  size?: keyof typeof SIZES;
  tone?: "cream" | "dim" | "gold";
  opacity?: number;
  multiplier?: LetterMultiplier;
}) {
  return (
    <View style={{ opacity, paddingTop: multiplier ? 8 : 0 }}>
      <Tile
        tile={{ id: `ledger-${letter}`, letter, points: LETTER_VALUES[letter], multiplier }}
        multiplierBadgePlacement="outside"
        side="front"
        size="small"
        scale={SIZES[size] / TILE_METRICS.small.width}
        ownership={tone === "gold" ? "private" : "neutral"}
        dimmed={tone === "dim"}
        fill={tone === "gold" ? "gold" : "ivory"}
        shadow={false}
        animation="none"
      />
    </View>
  );
}
