import type { LetterMultiplier } from "@wordpoker/contracts";
import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { View } from "react-native";

import { Tile } from "@/components/game/word-tile";

const SIZES = {
  lg: "medium",
  md: "small",
  sm: "small",
} as const;

export function MiniTile({ letter, size = "md", tone = "cream", opacity = 1, multiplier, points = LETTER_VALUES[letter] }: {
  letter: Letter;
  points?: number;
  size?: keyof typeof SIZES;
  tone?: "cream" | "dim" | "gold";
  opacity?: number;
  multiplier?: LetterMultiplier;
}) {
  return (
    <View style={{ opacity, paddingTop: 14 }}>
      <Tile
        tile={{ id: `ledger-${letter}`, letter, points, multiplier }}
        multiplierBadgePlacement="outside"
        side="front"
        size={SIZES[size]}
        ownership={tone === "gold" ? "private" : "neutral"}
        dimmed={tone === "dim"}
        fill={tone === "gold" ? "gold" : "ivory"}
        shadow={false}
        animation="none"
      />
    </View>
  );
}
