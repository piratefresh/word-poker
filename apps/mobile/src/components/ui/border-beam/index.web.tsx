import React, { memo } from "react";
import { View } from "react-native";

import { DEFAULT_COLORS } from "./const";
import type { IBorderBeam } from "./types";

export type { IBorderBeam } from "./types";

// A registered angle is what lets the conic gradient's start animate (plain custom properties can't).
const CSS = `@property --beam-a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes beam-spin{to{--beam-a:360deg}}`;
if (typeof document !== "undefined" && !document.getElementById("beam-css")) {
  const el = document.createElement("style");
  el.id = "beam-css";
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * The web beam: a rotating conic gradient cut down to a ring, plus a blurred copy for the glow.
 * Compositor-driven CSS, so it costs no WebGL context (Chrome caps a page at 16); native keeps the
 * Skia shader in `index.tsx`.
 */
const BorderBeam = memo(function BorderBeam({
  children,
  borderRadius = 16,
  borderWidth = 1.5,
  glow = 18,
  duration = 5,
  beamLength = 0.36,
  colors = DEFAULT_COLORS,
  intensity = 1,
  ambient = 0.12,
  style,
}: IBorderBeam) {
  const stops = colors.map((c, i) => `${c} ${(i / Math.max(colors.length - 1, 1)) * beamLength}turn`);
  const base = `color-mix(in srgb, ${colors[0]} ${ambient * 100}%, transparent)`;
  const gradient = `conic-gradient(from var(--beam-a), ${stops.join(", ")}, ${base} ${beamLength}turn, ${base} 1turn)`;
  const ring: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius,
    padding: borderWidth,
    boxSizing: "border-box",
    background: gradient,
    mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    WebkitMask: "linear-gradient(#000 0 0) content-box xor, linear-gradient(#000 0 0)",
    animation: `beam-spin ${Math.max(duration, 0.1)}s linear infinite`,
    pointerEvents: "none",
  };
  return (
    <View style={style}>
      {children}
      <div aria-hidden style={{ ...ring, opacity: intensity }} />
      <div aria-hidden style={{ ...ring, padding: borderWidth + glow / 4, filter: `blur(${glow / 2}px)`, opacity: 0.7 * intensity }} />
    </View>
  );
});

export { BorderBeam };
export default BorderBeam;
