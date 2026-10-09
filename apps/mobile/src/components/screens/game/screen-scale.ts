/**
 * screen-scale.ts — the one factor a large window grows the game screen by.
 *
 * A phone renders at its own size, so the factor is exactly 1 below `layout.wideShortSide`. Above
 * it the screen grows with the window's shorter side — on a desktop that is its height, which is
 * what the column (HUD, community, felt, rack, actions) has to share — and stops at `MAX_SCALE`.
 * Every piece that grows with the window (banner, controls, tiles, seats, the action row) reads
 * this factor instead of keeping a threshold of its own, so they move together.
 */

import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout } from "@/constants/theme";

/** The short side at which the screen is drawn at its phone size times one. */
const REFERENCE_SHORT_SIDE = 720;
const MAX_SCALE = 1.6;
/** The play column's widest reach at a scale of one, before the width factor below. */
const STAGE_BASE_WIDTH = 520;
const STAGE_WIDTH_FACTOR = 1.6;

interface Window {
  width: number;
  height: number;
}

const shortSide = (window: Window): number =>
  Math.min(window.width, window.height);

/** The factor for a window: 1 on a phone, growing with the shorter side up to `MAX_SCALE`. */
export function screenScale(window: Window): number {
  const short = shortSide(window);
  if (short < layout.wideShortSide) return 1;
  return Math.min(MAX_SCALE, Math.max(1, short / REFERENCE_SHORT_SIDE));
}

/**
 * The widest the play column may get, or `undefined` for a phone-sized window, which the column
 * fills as it always has. The backdrop and HUD stay full-bleed; only the table, rack and controls
 * are bounded.
 */
export function stageMaxWidth(window: Window): number | undefined {
  if (shortSide(window) < layout.wideShortSide) return undefined;
  return STAGE_BASE_WIDTH * screenScale(window) * STAGE_WIDTH_FACTOR;
}

/** The window's screen scale, read where it is drawn. */
export function useScreenScale(): number {
  return screenScale(useWindowDimensions());
}

/** Below these a window is an iPhone SE-class screen and the bottom controls tighten. */
const COMPACT_WIDTH = 375;
/** The iPhone SE itself is 375 by 667, so the height is a ceiling, not a floor. */
const COMPACT_HEIGHT = 667;

/** Whether the window is too small for the full-size bottom controls. */
export function isCompactWindow(window: Window): boolean {
  return (
    window.height >= window.width &&
    (window.width < COMPACT_WIDTH || window.height <= COMPACT_HEIGHT)
  );
}

/** `isCompactWindow`, read where it is drawn — against the usable height, insets carved out. */
export function useCompactControls(): boolean {
  return isCompactWindow(useUsableWindow());
}

/** Below this a landscape window's rack shrinks, the way portrait's compact controls do. */
const COMPACT_LANDSCAPE_HEIGHT = 450;

/** Whether a landscape window is too short for the landscape rack's full-size tiles. */
export function isCompactLandscapeWindow(window: Window): boolean {
  return window.width > window.height && window.height < COMPACT_LANDSCAPE_HEIGHT;
}

/** Below this a portrait window's betting row shrinks, leaving the height to the felt. */
const SHORT_HEIGHT = 800;

/** Whether the window is a portrait one too short for the full-size betting row. */
export function isShortWindow(window: Window): boolean {
  return window.height >= window.width && window.height < SHORT_HEIGHT;
}

/** `isShortWindow`, read where it is drawn — against the usable height, insets carved out. */
export function useShortControls(): boolean {
  return isShortWindow(useUsableWindow());
}

/**
 * The window with the top/bottom safe-area insets carved out of its height: a notch and a home
 * indicator eat real space on a device (Firefox's responsive mode simulates neither), so the
 * compact/short breakpoints have to read the space actually left for the felt and controls, not
 * the raw screen size.
 */
function useUsableWindow(): Window {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return { ...window, height: window.height - insets.top - insets.bottom };
}

/** The table's widest box at a scale of one, rail and seats included. */
const TABLE_BASE_WIDTH = 420;

/**
 * The widest the table's box may get, or `undefined` for a phone-sized window. The felt fits the
 * box, so bounding it keeps the table in proportion with the tiles, banner and buttons, which
 * grow by the same scale, instead of filling all the height the column has left.
 */
export function tableMaxWidth(window: Window): number | undefined {
  if (shortSide(window) < layout.wideShortSide) return undefined;
  return TABLE_BASE_WIDTH * screenScale(window);
}
