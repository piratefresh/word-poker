import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import { colors, palette } from "@/constants/theme";

/** The gold bar drawn when Rive cannot load (or the platform has no runtime): same box, same progress. */
export function StaticXpBar({ progress }: { progress: number }): ReactElement {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
    </View>
  );
}

/** The bar artboard's proportions (2172 × 724), so the Rive view and its fallback take the same room. */
export const XP_BAR_ASPECT = 2172 / 724;

const styles = StyleSheet.create({
  track: {
    ...StyleSheet.absoluteFill,
    top: "30%",
    bottom: "30%",
    borderRadius: 999,
    backgroundColor: palette.gold600,
    borderWidth: 2,
    borderColor: colors.goldDeep,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999, backgroundColor: palette.gold200 },
});
