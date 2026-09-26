import { StyleSheet } from "react-native";

import { AnimatedMeshGradient } from "@/components/table/mesh-gradiant";
import type { IAnimatedMeshGradient } from "@/components/table/mesh-gradiant/types";

import { useBackdropStyle, useBackdropUrgency } from "./backdrop-style";
import { TableAtmosphere } from "./table-atmosphere";

type BackdropLook = Pick<
  IAnimatedMeshGradient,
  "blur" | "colors" | "contrast" | "noise" | "painted" | "speed"
>;

/**
 * Emerald: dark felt under slow-moving light — shadow green, dark teal, the emerald glow and a
 * muted green, finished by the shader's vignette, centre hotspot and painted strokes. The drift is
 * slow on purpose: the table, seats and tiles are the actors, the light only moves behind.
 */
const EMERALD: BackdropLook = {
  blur: 0.7,
  colors: [
    { r: 1 / 255, g: 29 / 255, b: 27 / 255 },
    { r: 2 / 255, g: 48 / 255, b: 42 / 255 },
    { r: 0 / 255, g: 78 / 255, b: 62 / 255 },
    { r: 4 / 255, g: 57 / 255, b: 48 / 255 },
  ],
  contrast: 0.5,
  noise: 0.18,
  painted: true,
  speed: 0.12,
};

/** Ember: deep greens drifting under a low ember of gold, tuned as in the Reacticx docs. */
const EMBER: BackdropLook = {
  blur: 1.5,
  colors: [
    { r: 0.02, g: 0.08, b: 0.06 },
    { r: 0.05, g: 0.23, b: 0.18 },
    { r: 0.1, g: 0.29, b: 0.21 },
    { r: 0.3, g: 0.22, b: 0.08 },
  ],
  contrast: 0.5,
  noise: 2,
  painted: false,
  speed: 1,
};

/** How many times its calm speed a look drifts at when the turn clock runs out. */
const URGENT_SPEED_FACTOR = 5;

/**
 * The look's speed for a turn that has spent `urgency` of its budget: calm for most of the turn,
 * then climbing steeply toward the end, so the light only hurries when time is actually short.
 */
function driftSpeed(calm: number, urgency: number): number {
  const spent = Math.max(0, Math.min(1, urgency));
  return calm * (1 + (URGENT_SPEED_FACTOR - 1) * spent ** 3);
}

/**
 * The animated mesh gradient behind the offline and online table, filling its parent, with the
 * room's atmosphere — vignette, grain, edge haze — laid over it and under the table. Its drift
 * quickens as the turn clock runs down.
 */
export function TableBackdrop() {
  const look = useBackdropStyle() === "emerald" ? EMERALD : EMBER;
  const speed = driftSpeed(look.speed ?? 1, useBackdropUrgency());
  return (
    <>
      <AnimatedMeshGradient {...look} speed={speed} style={StyleSheet.absoluteFill} />
      <TableAtmosphere />
    </>
  );
}
