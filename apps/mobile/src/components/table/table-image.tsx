/**
 * The shape of the parlor table's painting (wood rail, gold bands, slate stones, felt), which the
 * table's layout math still measures. The layout box is the oval rail's outer edge inside the
 * picture; only its shadowed lip reaches past it. The seats sit inside that box: their avatars on
 * the felt, their labels free to ride the rail (`placeSeatsOnFelt`).
 */
/** The rail's outer top edge — the box the seats sit around — in the picture's pixels. */
const TOP = { x: 40, y: 75, width: 1368, height: 935 };
/** Everything painted (the rest of the picture is transparent), in the picture's pixels. */
const PAINTED = { left: 36, top: 70, right: 1412, bottom: 1016 };
/** The green inside the gold band, in the picture's pixels. */
const CLOTH = { left: 137, top: 157, right: 1306, bottom: 889 };

/** The table top's width over its height: the only shape the picture comes in. */
export const TABLE_ASPECT = TOP.width / TOP.height;

/**
 * How far the painting reaches past the table top's box on each side, as shares of the box's
 * height: the far stone above, the side stones left and right, the wall and near stone below.
 */
export const TABLE_REACH = {
  top: (TOP.y - PAINTED.top) / TOP.height,
  side:
    Math.max(TOP.x - PAINTED.left, PAINTED.right - (TOP.x + TOP.width)) /
    TOP.height,
  bottom: (PAINTED.bottom - (TOP.y + TOP.height)) / TOP.height,
} as const;

/** An ellipse by its centre and radii, as shares of the table top's width (x) and height (y). */
export interface NormEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** The rail's outer edge: the oval that fills the table top's box. */
export const TABLE_RAIL: NormEllipse = { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 };

/** The felt inside the rail's gold band — the playing surface a seat's avatar sits on. */
export const TABLE_FELT: NormEllipse = {
  cx: ((CLOTH.left + CLOTH.right) / 2 - TOP.x) / TOP.width,
  cy: ((CLOTH.top + CLOTH.bottom) / 2 - TOP.y) / TOP.height,
  rx: (CLOTH.right - CLOTH.left) / 2 / TOP.width,
  ry: (CLOTH.bottom - CLOTH.top) / 2 / TOP.height,
};
