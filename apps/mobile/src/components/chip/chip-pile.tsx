import { StyleSheet, View } from "react-native";

import { ShadowBox } from "@/components/ui/shadow-box";
import { chipBreakdown } from "@/lib/ui/chip-breakdown";

import { ChipSprite } from "./chip-sprite";

/** Decorative change for an amount, bounded to five stacks in the pot's existing slot. */
export function ChipPile({ amount, scale = 1 }: { amount: number; scale?: number }) {
  const chips = chipBreakdown(amount, 24);
  const stackCount = Math.min(5, Math.ceil(chips.length / 4));
  const spread = Math.min(68, (stackCount - 1) * 24);

  return (
    <View pointerEvents="none" style={{ width: 100 * scale, height: 44 * scale }}>
      {/* One soft shadow under the whole pile, from a footprint box that is itself never drawn. */}
      <View style={{ bottom: 4 * scale, height: 10 * scale, left: 14 * scale, position: "absolute", right: 14 * scale }}>
        <ShadowBox radius={5 * scale} shadows={[{ dy: 6 * scale, blur: 12 * scale, color: "rgba(30,14,0,0.85)" }]} />
      </View>
      {Array.from({ length: stackCount }, (_, stackIndex) => {
        const stack = chips.filter((_, index) => index % stackCount === stackIndex);
        const left = stackCount === 1 ? 34 : (68 - spread) / 2 + (spread * stackIndex) / (stackCount - 1);
        const base = (stack.length - 1) * 3.5 + Math.abs(left - 34) * 0.12;
        return (
          <View key={stackIndex} style={[styles.stack, { left: left * scale, top: base * scale }]}>
            {stack.map((tone, index) => (
              <View key={index} style={[styles.chip, { top: -index * 3.5 * scale }]}>
                {/* The shared atlas uses purple for the denomination's dark chip. */}
                <ChipSprite tone={tone === "black" ? "purple" : tone} size={32 * scale} pose="tilted" />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { position: "absolute" },
  chip: { position: "absolute", left: 0 },
});
