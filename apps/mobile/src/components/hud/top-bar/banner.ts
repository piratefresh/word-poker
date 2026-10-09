/**
 * banner.ts — the HUD bar's geometry: the wooden capsule and the corner buttons share one row,
 * and a larger window grows both by the one screen scale.
 */

import { screenScale } from "@/components/screens/game/screen-scale";

import { CHIP_HEIGHT } from "./balance-chip";

/** The capsule's height at the phone's scale; the corner discs ride level with it. */
export const CAPSULE_HEIGHT = 40;

/** Breathing room above the row, so the capsule doesn't sit flush against the top edge. */
export const BAR_TOP_PAD = 12;

/** The controls' row at the phone's scale: as tall as its tallest control. */
export const CONTROL_ROW_HEIGHT = CAPSULE_HEIGHT;

/** The gap between the capsule and the mode tag hanging under it: negative, so the tag tucks
 *  a little under the capsule's foot. */
export const MODE_TAG_GAP = -6;

/**
 * The room the mode tag hangs into below the capsule. The bar's own height is unchanged by it:
 * the tag hangs over the room under the header, which keeps that band clear of its seats.
 */
export const MODE_TAG_BLOCK = MODE_TAG_GAP + CHIP_HEIGHT;

/** The bar's height for a window: the whole of the HUD's chrome, which a screen reserves. */
export function hudBarHeight(window: { width: number; height: number }): number {
  return BAR_TOP_PAD + Math.ceil(CAPSULE_HEIGHT * screenScale(window));
}
