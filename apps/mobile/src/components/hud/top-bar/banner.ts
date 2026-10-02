/**
 * banner.ts — the phase banner's geometry: the phase title lettered above the plate, the picture
 * and its clock plate, the clock's glass that the turn lights, and the one scale that sizes the
 * frame, the lettering and the controls' row together for a window.
 */

import type { StyleProp, TextStyle, ViewStyle } from "react-native";

import { LABEL_BAND_PAD } from "@/components/screens/game/primitives/label-band";
import { screenScale } from "@/components/screens/game/screen-scale";
import { spacing } from "@/constants/theme";

// Relative, not `@/assets`: Jest maps `@/` to `src/` only.
export const BANNER = require("../../../../assets/images/ui/timer-3.png");
/** The banner picture, in its own pixels. */
const BANNER_IMAGE = { width: 2172, height: 724 };
/** The painted wood and frame (the rest of the picture is transparent margin). */
const BANNER_PAINTED = { left: 71, top: 116, width: 2030, height: 467 };
/** The part of the glass that carries the clock, clear of its pointed ends. */
const CLOCK_PLATE = { x: 330, y: 175, width: 1510, height: 330 };
/**
 * The clock's glass inside the gold frame, clockwise from its top-left corner: a flat top and
 * bottom, and each end brought to a point. Traced off the picture's pixels and held a couple of
 * pixels inside the gold, so the turn's light never spills onto it.
 */
const CLOCK_GLASS = [
  [226, 173],
  [1947, 173],
  [1997, 236],
  [1841, 505],
  [326, 505],
  [174, 236],
] as const;
/**
 * The banner's scale on a phone: narrow enough that the plate's points clear the controls on
 * either side of it. A window too narrow for even that shrinks the banner and its lettering
 * together, so the digits always stay inside the frame.
 */
const BANNER_BASE_SCALE = 0.11;
/** The banner's largest scale for a window: the one the HUD reserves room for. */
function bannerMaxScale(window: { width: number; height: number }): number {
  // A larger window hangs a larger banner, so the clock keeps pace with the seats and tiles.
  return BANNER_BASE_SCALE * screenScale(window);
}
/** The HUD's own side padding, which the banner has to clear. */
const HUD_SIDE_PAD = spacing.md;
/**
 * Lettering at the banner's phone scale; a larger banner carries it larger. The stamp matches
 * the community rack's caption at the phone's scale, as it wears the same band.
 */
const BANNER_TYPE = {
  stamp: { fontSize: 12, lineHeight: 16, letterSpacing: 1.6 },
  clock: { fontSize: 28, lineHeight: 34, letterSpacing: 1 },
} as const;
/** The gap between the phase title's band and the top of the plate, at the phone's scale. */
const STAMP_GAP = 2;

/** Breathing room above the banner, so its title doesn't sit flush against the top edge. */
const BAR_TOP_PAD = 12;

/** The controls' row at the phone's scale: as tall as its tallest control, the leading button and the chip. */
export const CONTROL_ROW_HEIGHT = 30;

/** The phase title's band, its words and their padding, for a lettering factor. */
function stampBand(type: number): number {
  return (BANNER_TYPE.stamp.lineHeight + LABEL_BAND_PAD.vertical * 2) * type;
}

/** The phase title's band and the gap under it, for a lettering factor. */
function stampBlock(type: number): number {
  return stampBand(type) + STAMP_GAP * type;
}

/**
 * The bar's height for a window, which is the whole of the HUD's chrome: a screen showing the
 * HUD reserves exactly this much room for it. The controls ride beside the banner rather than
 * above it, so the title and the banner at their largest are the whole of that height, and a
 * narrow window's smaller banner leaves the felt where it was.
 */
export function hudBarHeight(window: { width: number; height: number }): number {
  const scale = bannerMaxScale(window);
  return (
    BAR_TOP_PAD +
    Math.ceil(stampBlock(scale / BANNER_BASE_SCALE) + BANNER_PAINTED.height * scale)
  );
}

/**
 * The banner scaled to the window: its largest scale where there is room, and whatever
 * fits between the HUD's side padding where there is not. Positions and lettering are
 * all read off the one scale, so the words, the frame and the controls level with the
 * plate cannot drift apart.
 */
export function bannerLayout(window: { width: number; height: number }) {
  const room = Math.max(0, window.width - HUD_SIDE_PAD * 2);
  const scale = Math.min(bannerMaxScale(window), room / BANNER_PAINTED.width);
  const type = scale / BANNER_BASE_SCALE;
  const stampTop = stampBlock(type);
  const plateMiddle =
    (CLOCK_PLATE.y + CLOCK_PLATE.height / 2 - BANNER_PAINTED.top) * scale;
  const controlRow = CONTROL_ROW_HEIGHT * screenScale(window);
  const styles = {
    // The controls' row, centred on the clock's plate so the buttons read level with it.
    bar: {
      height: controlRow,
      top: BAR_TOP_PAD + stampTop + plateMiddle - controlRow / 2,
    },
    // Cropped to the painted frame, so the picture's transparent margin takes no room; the
    // title hangs in the margin above it.
    frame: {
      alignSelf: "center",
      height: BANNER_PAINTED.height * scale,
      marginTop: BAR_TOP_PAD + stampTop,
      width: BANNER_PAINTED.width * scale,
    },
    art: {
      height: BANNER_IMAGE.height * scale,
      left: -BANNER_PAINTED.left * scale,
      position: "absolute",
      top: -BANNER_PAINTED.top * scale,
      width: BANNER_IMAGE.width * scale,
    },
    // The title's band, in the margin above the frame and centred over the plate. It is laid
    // out in the bar's own box rather than hung off the frame's: on Android a view outside its
    // parent's box draws dim through the entrance's fade and drops out of the accessibility
    // tree (STO-516).
    stampPlate: {
      alignItems: "center",
      height: stampBand(type),
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: BAR_TOP_PAD,
    },
    stampBand: {
      paddingHorizontal: LABEL_BAND_PAD.horizontal * type,
      paddingVertical: LABEL_BAND_PAD.vertical * type,
    },
    clockPlate: plateBox(CLOCK_PLATE, scale),
    stamp: scaledType(BANNER_TYPE.stamp, type),
    clock: scaledType(BANNER_TYPE.clock, type),
  } satisfies Record<string, StyleProp<ViewStyle> | TextStyle>;
  return { ...styles, glass: glassLayout(scale) };
}

/** The clock's glass for a canvas laid over it: its box, its outline, and the picture behind it. */
export interface GlassLayout {
  /** The glass's bounding box within the cropped frame. */
  box: ViewStyle & { width: number; height: number };
  /** The glass's outline, in the box's own points. */
  outline: { x: number; y: number }[];
  /** Where the whole picture sits in the box's points, so the canvas can redraw its slice. */
  art: { x: number; y: number; width: number; height: number };
  /** The banner's scale, which is all the rest is read off. */
  scale: number;
}

function glassLayout(scale: number): GlassLayout {
  const xs = CLOCK_GLASS.map(([x]) => x);
  const ys = CLOCK_GLASS.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    box: {
      height: (Math.max(...ys) - top) * scale,
      left: (left - BANNER_PAINTED.left) * scale,
      position: "absolute",
      top: (top - BANNER_PAINTED.top) * scale,
      width: (Math.max(...xs) - left) * scale,
    },
    outline: CLOCK_GLASS.map(([x, y]) => ({ x: (x - left) * scale, y: (y - top) * scale })),
    art: {
      height: BANNER_IMAGE.height * scale,
      width: BANNER_IMAGE.width * scale,
      x: -left * scale,
      y: -top * scale,
    },
    scale,
  };
}

/** A plate's box within the cropped frame, centring what it carries. */
function plateBox(
  plate: { x: number; y: number; width: number; height: number },
  scale: number,
): ViewStyle {
  return {
    alignItems: "center",
    height: plate.height * scale,
    justifyContent: "center",
    left: (plate.x - BANNER_PAINTED.left) * scale,
    position: "absolute",
    top: (plate.y - BANNER_PAINTED.top) * scale,
    width: plate.width * scale,
  };
}

function scaledType(
  base: { fontSize: number; lineHeight: number; letterSpacing: number },
  factor: number,
): TextStyle {
  return {
    fontSize: base.fontSize * factor,
    letterSpacing: base.letterSpacing * factor,
    lineHeight: base.lineHeight * factor,
  };
}
