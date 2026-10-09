import { StyleSheet, View } from "react-native";

import type { ShadowBoxProps, ShadowSpec } from "./shadow-box-canvas";

export type { ShadowBoxProps, ShadowSpec } from "./shadow-box-canvas";

const css = (s: ShadowSpec) => `${s.inner ? "inset " : ""}${s.dx ?? 0}px ${s.dy}px ${s.blur}px ${s.color}`;

/** CSS box-shadow instead of Skia on the web: no WebGL context per shadow (Chrome caps a page at 16). */
export function ShadowBox({ radius, shadows }: ShadowBoxProps) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: shadows.map(css).join(", ") }]}
    />
  );
}
