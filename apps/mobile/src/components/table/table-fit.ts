/**
 * table-fit.ts — where the felt box goes inside the box the table is given.
 *
 * Pure math over the painted table's shape (`TABLE_ASPECT`, `TABLE_REACH`) and, when the caller
 * knows them, the seats' own bounds. No React, so the fit can be checked at every window size
 * without a renderer.
 */

import {
  TABLE_ASPECT,
  TABLE_FELT,
  TABLE_RAIL,
  TABLE_REACH,
  type NormEllipse,
} from "./table-image";
import type { SeatAnchor } from "./table-layout";

export type PixelSize = { width: number; height: number };

/**
 * How far a seat's chrome reaches from its anchor, in pixels, on each side: `top` above the
 * anchor, `bottom` below it, and so on. All four are distances, so all are positive.
 */
export interface SeatExtents {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /**
   * The radius around the anchor that has to stay on the felt when seats are placed inside the
   * table (`placeSeatsOnFelt`): the avatar. Everything else may ride the rail.
   */
  core?: number;
}

/**
 * A seat's extents for a felt `tableWidth` pixels wide. Seats that scale with the table grow
 * with it, so the fit asks again at every width it tries; the answer must be the seat's fullest
 * state (a bet, every badge, a winner's glow) so a change of state never resizes the table.
 */
export type SeatBounds = (
  anchor: SeatAnchor,
  tableWidth: number,
  seatCount: number,
) => SeatExtents;

export interface TableFit {
  /** Pixel size of the felt box. */
  size: PixelSize;
  /** Offset of the felt box within the outer box. */
  origin: { x: number; y: number };
}

/**
 * Fit the felt box — the painted table's top, at its own aspect — inside the available box:
 * `inset` clear of the edges for the seats' chrome, and with room for the painting that reaches
 * past the felt box (the stones out and up, the wall down), so the container never clips it.
 */
export function fitFelt(box: PixelSize, inset: number): TableFit {
  const availW = Math.max(0, box.width - inset * 2);
  const availH = Math.max(0, box.height - inset * 2);
  let width = Math.min(availW, availH * TABLE_ASPECT);
  let height = width / TABLE_ASPECT;
  if (height > availH) {
    height = availH;
    width = height * TABLE_ASPECT;
  }
  // The painting's reach grows with the table, so it bounds the felt as a share of its height.
  const reachY = 2 * Math.max(TABLE_REACH.top, TABLE_REACH.bottom);
  const reachX = 2 * TABLE_REACH.side;
  const fit = Math.min(
    1,
    box.height / (height * (1 + reachY)),
    box.width / (width + height * reachX),
  );
  width *= fit;
  height *= fit;
  return {
    size: { width, height },
    origin: { x: (box.width - width) / 2, y: (box.height - height) / 2 },
  };
}

/** A rectangle by its edges, in felt-box pixels (the felt's top-left is the origin). */
interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Everything the table draws for a felt `width` wide: the painting, with its reach past the felt
 * box, and every seat's fullest chrome around its anchor.
 */
export function tableEdges(
  width: number,
  seats: readonly SeatAnchor[],
  seatBounds: SeatBounds,
  seatCount = seats.length,
): Edges {
  const height = width / TABLE_ASPECT;
  const edges: Edges = {
    left: -TABLE_REACH.side * height,
    top: -TABLE_REACH.top * height,
    right: width + TABLE_REACH.side * height,
    bottom: height + TABLE_REACH.bottom * height,
  };
  for (const anchor of seats) {
    const x = anchor.x * width;
    const y = anchor.y * height;
    const e = seatBounds(anchor, width, seatCount);
    edges.left = Math.min(edges.left, x - e.left);
    edges.top = Math.min(edges.top, y - e.top);
    edges.right = Math.max(edges.right, x + e.right);
    edges.bottom = Math.max(edges.bottom, y + e.bottom);
  }
  return edges;
}

/** Bisection steps: the box is at most a few thousand pixels, so this lands well inside one. */
const FIT_STEPS = 24;

/**
 * Fit the painted table and its seats together: the widest felt whose painting and seats, all
 * scaled for that width, fit inside the box `gutter` clear of its edges — then that combined
 * block centred, so a hero's labels hanging below the rail are balanced against the far seat's
 * badges above it rather than the felt alone being centred.
 *
 * The seats grow with the felt (or hold a floor), so a wider felt never has smaller bounds and
 * the largest width that fits is found by bisection.
 */
export function fitTable(
  box: PixelSize,
  seats: readonly SeatAnchor[],
  seatBounds: SeatBounds,
  gutter = 0,
  seatCount = seats.length,
  place?: (size: PixelSize) => readonly SeatAnchor[],
): TableFit {
  const availW = box.width - gutter * 2;
  const availH = box.height - gutter * 2;
  // Seats placed for the felt they sit on (`placeSeatsOnFelt`) move with its width.
  const seatsAt = (width: number) =>
    place ? place({ width, height: width / TABLE_ASPECT }) : seats;
  const fits = (width: number) => {
    const e = tableEdges(width, seatsAt(width), seatBounds, seatCount);
    return e.right - e.left <= availW && e.bottom - e.top <= availH;
  };

  let lo = 0;
  let hi = Math.max(0, availW);
  if (hi > 0 && fits(hi)) lo = hi;
  else {
    for (let step = 0; step < FIT_STEPS; step++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }

  const width = Math.floor(lo);
  if (width <= 0)
    return { size: { width: 0, height: 0 }, origin: { x: 0, y: 0 } };
  const height = width / TABLE_ASPECT;
  const e = tableEdges(width, seatsAt(width), seatBounds, seatCount);
  return {
    size: { width, height },
    origin: {
      x: (box.width - (e.right - e.left)) / 2 - e.left,
      y: (box.height - (e.bottom - e.top)) / 2 - e.top,
    },
  };
}

/** How far a seat's chrome stays inside the rail's outer edge, in pixels. */
const RAIL_CLEARANCE = 3;
/** How far a seat's avatar stays inside the felt's edge, in pixels, beyond `CORE_DEPTH`. */
const FELT_CLEARANCE = 2;
/**
 * How deep an avatar sits on the felt, as a share of its radius: clear of the gold band, so it
 * reads as seated at the table rather than pressed against its edge.
 */
const CORE_DEPTH = 0.3;
/** A seat facing straight down the table, within this much (as the sine of its angle): the hero. */
const NEAR_SEAT = 0.9;

/** Whether a pixel point lies inside an ellipse drawn over a felt box `size`, shrunk by `inset`. */
function insideEllipse(
  x: number,
  y: number,
  ellipse: NormEllipse,
  size: PixelSize,
  inset: number,
): boolean {
  const rx = ellipse.rx * size.width - inset;
  const ry = ellipse.ry * size.height - inset;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (x - ellipse.cx * size.width) / rx;
  const dy = (y - ellipse.cy * size.height) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Points around a circle: enough that one inside an ellipse means the circle is, to a pixel. */
const CORE_SAMPLES = Array.from(
  { length: 16 },
  (_, i) => (i / 16) * 2 * Math.PI,
);

/**
 * Seat the players inside the table rather than around it: each seat's chrome, centred on its
 * direction from the felt's middle, slides out along it as far as it can while the whole seat
 * stays inside the rail's outer edge and its avatar (`SeatExtents.core`) sits on the felt, clear
 * of the gold band. The labels may ride the wood. The felt is shallow, so the two seats down its
 * middle give the pot room: the near seat (the hero's, facing straight down the table) may hang its
 * labels below the rail, toward the player, and the far seat sits up on the far rail, its avatar
 * free of the felt.
 *
 * Returns the seats with their anchors moved, in the same normalized box and with the same
 * `angle`, so everything that reads anchors (chip flights, the dealer button) follows.
 */
export function placeSeatsOnFelt(
  seats: readonly SeatAnchor[],
  size: PixelSize,
  seatBounds: SeatBounds,
  seatCount = seats.length,
): SeatAnchor[] {
  if (size.width <= 0 || size.height <= 0) return [...seats];
  const cx = TABLE_FELT.cx * size.width;
  const cy = TABLE_FELT.cy * size.height;
  const reachX = TABLE_FELT.rx * size.width;
  const reachY = TABLE_FELT.ry * size.height;

  return seats.map((seat) => {
    const e = seatBounds(seat, size.width, seatCount);
    const core = e.core ?? 0;
    // The chrome's centre, relative to the anchor.
    const offsetX = (e.right - e.left) / 2;
    const offsetY = (e.bottom - e.top) / 2;
    const halfW = (e.left + e.right) / 2;
    const halfH = (e.top + e.bottom) / 2;
    const dirX = Math.cos(seat.angle) * reachX;
    const dirY = Math.sin(seat.angle) * reachY;
    const near = Math.sin(seat.angle) > NEAR_SEAT;
    // The far seat, across the table from the player, sits up on the far rail: its avatar is not
    // held to the felt, which gives the pot the depth of the table's middle.
    const far = Math.sin(seat.angle) < -NEAR_SEAT;

    const anchorAt = (t: number) => ({
      x: cx + dirX * t - offsetX,
      y: cy + dirY * t - offsetY,
    });
    const fits = (t: number) => {
      const a = anchorAt(t);
      const left = a.x - e.left;
      const right = a.x + e.right;
      const top = a.y - e.top;
      const bottom = a.y + e.bottom;
      // The rail is convex, so the box is inside it when its corners are.
      const corners: [number, number][] = [
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom],
      ];
      // The near seat's labels may hang below the rail, toward the player — its avatar still sits
      // on the felt, and the fit makes room under the table (`fitTable`'s `place`).
      const held = near ? corners.slice(0, 2) : corners;
      if (
        !held.every(([x, y]) =>
          insideEllipse(x, y, TABLE_RAIL, size, RAIL_CLEARANCE),
        )
      )
        return false;
      if (far) return true;
      return CORE_SAMPLES.every((angle) =>
        insideEllipse(
          a.x + Math.cos(angle) * core,
          a.y + Math.sin(angle) * core,
          TABLE_FELT,
          size,
          FELT_CLEARANCE + core * CORE_DEPTH,
        ),
      );
    };

    // Outward only ever leaves the rail or the felt, so the farthest fit is found by bisection.
    // A seat too big to fit anywhere keeps the middle of its side (t = 0).
    let lo = 0;
    let hi = 1 + Math.max(halfW / reachX, halfH / reachY);
    if (fits(0)) {
      for (let step = 0; step < FIT_STEPS; step++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    }
    const a = anchorAt(lo);
    return { ...seat, x: a.x / size.width, y: a.y / size.height };
  });
}

/**
 * The open band down the table's middle, between the seats above the pot and the seats below it:
 * the lowest reach of any seat above the felt's centre whose chrome crosses the middle column,
 * and the highest reach of any such seat below it. Seats placed inside the table leave the pot
 * this gap and no more, so the pot goes at its middle rather than at a fixed height.
 *
 * Returns the band's centre in the normalized box, or null when no seat crosses the middle.
 */
export function openBandCenter(
  seats: readonly SeatAnchor[],
  size: PixelSize,
  seatBounds: SeatBounds,
  seatCount = seats.length,
): number | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const midX = size.width / 2;
  const midY = TABLE_FELT.cy * size.height;
  let top = TABLE_FELT.cy * size.height - TABLE_FELT.ry * size.height;
  let bottom = TABLE_FELT.cy * size.height + TABLE_FELT.ry * size.height;
  for (const seat of seats) {
    const e = seatBounds(seat, size.width, seatCount);
    const x = seat.x * size.width;
    const y = seat.y * size.height;
    if (x - e.left > midX || x + e.right < midX) continue;
    if (y < midY) top = Math.max(top, y + e.bottom);
    else bottom = Math.min(bottom, y - e.top);
  }
  return (top + bottom) / 2 / size.height;
}
