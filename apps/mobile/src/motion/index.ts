/**
 * motion/ — the in-hand screen's animation plumbing: no components, no pixels.
 *
 * Timings and springs live with the rest of the design tokens in `constants/theme.ts`;
 * this module only carries the shared state the effects restart from.
 */

export { usePhaseClock } from "./phase-clock";
export type { PhaseClock } from "./phase-clock";
export { useLoopsEnabled } from "./loop-gate";
