import { createRng } from "@wordpoker/game-rules";

/**
 * The poker chip as numbers (STO-481): where its face, wall and shadow sit on the canvas, where
 * the inserts fall, and the wear a seed leaves on it. Pure and Skia-free — `paint.ts` turns it
 * into pixels — so the same seed and size give the same chip on every platform, and the tests
 * can read the choices directly.
 *
 * Everything on the face is in unit-circle coordinates (radius 1, y down); the painter scales
 * them by the face's radius and squashes y by `squash` for a tilted chip.
 */

/** Cream inserts around the edge, as on the reference sheet. */
export const INSERT_COUNT = 8;
/** How much of each insert's slot (360° / count) the cream covers. */
export const INSERT_SPAN = 0.42;
/** The wall's height against the chip's diameter, seen side on. */
const THICKNESS = 0.11;
const SCRATCH_COUNT = 3;
const SPECKLE_COUNT = 28;

/** FNV-1a: `t-11` and `t-12` land far apart, which is all a seed needs. */
export function hashTileId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Scratch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

export interface Speckle {
  x: number;
  y: number;
  r: number;
  light: boolean;
}

export interface ChipGeometry {
  /** Canvas size in points. */
  width: number;
  height: number;
  /** Centre of the top face. */
  cx: number;
  cy: number;
  /** Face radius in points; the face is `r` wide and `r * squash` tall. */
  r: number;
  squash: number;
  /** How far the wall drops below the face, in points (0 for a chip seen straight on). */
  depth: number;
  /** Centre angle (radians) of each insert. */
  inserts: number[];
  /** Half the angular width of an insert (radians). */
  insertHalf: number;
  scratches: Scratch[];
  speckles: Speckle[];
  /** A small lift (+) or dimming (−) of the whole face, so no two chips match exactly. */
  brightness: number;
}

/**
 * Lays out a chip `size` points wide. `tilt` is radians away from face on: 0 is a chip seen from
 * straight above, about 1 is a chip lying on the felt seen from a player's seat.
 */
export function generateChip(
  seed: number,
  size: number,
  tilt = 0,
): ChipGeometry {
  const rng = createRng(seed >>> 0);
  const squash = Math.cos(tilt);
  const pad = size * 0.04;
  const r = size / 2 - pad;
  const depth = size * THICKNESS * Math.sin(tilt);
  const faceHeight = r * 2 * squash;

  const step = (Math.PI * 2) / INSERT_COUNT;
  const phase = rng() * step;
  const inserts = Array.from(
    { length: INSERT_COUNT },
    (_, i) => phase + i * step,
  );

  const scratches: Scratch[] = [];
  for (let i = 0; i < SCRATCH_COUNT; i += 1) {
    const angle = rng() * Math.PI * 2;
    const reach = 0.2 + rng() * 0.55;
    const x = Math.cos(angle) * reach;
    const y = Math.sin(angle) * reach;
    const dir = rng() * Math.PI;
    const len = 0.08 + rng() * 0.14;
    scratches.push({
      x1: x,
      y1: y,
      x2: x + Math.cos(dir) * len,
      y2: y + Math.sin(dir) * len,
      alpha: 0.1 + rng() * 0.12,
    });
  }

  const speckles: Speckle[] = [];
  for (let i = 0; i < SPECKLE_COUNT; i += 1) {
    const angle = rng() * Math.PI * 2;
    const reach = Math.sqrt(rng()) * 0.96;
    speckles.push({
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach,
      r: 0.008 + rng() * 0.014,
      light: rng() < 0.4,
    });
  }

  return {
    width: size,
    height: Math.ceil(faceHeight + depth + pad * 2 + size * 0.04),
    cx: size / 2,
    cy: pad + r * squash,
    r,
    squash,
    depth,
    inserts,
    insertHalf: (step * INSERT_SPAN) / 2,
    scratches,
    speckles,
    brightness: (rng() - 0.5) * 0.08,
  };
}
