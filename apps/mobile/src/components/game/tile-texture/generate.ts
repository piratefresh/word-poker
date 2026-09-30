import { createRng } from "@wordpoker/game-rules";

/**
 * The letter tile's face as pixel art: whole cells on a grid, no anti-aliased strokes. Pure and
 * Skia-free — `paint.ts` turns the cells into pixels — so the same tile id and size give the
 * same face on every platform, and the tests can read the cells directly.
 */

export type Tone =
  | "band0"
  | "band1"
  | "band2"
  | "band3"
  | "bevelLight"
  | "bevelEdge"
  | "grainLight"
  | "grainDark";

export interface Cell {
  x: number;
  y: number;
}
export interface ToneCell extends Cell {
  tone: Tone;
}

export interface TileTexture {
  cols: number;
  rows: number;
  /** Points per cell — the painter multiplies it by the pixel ratio. */
  cell: number;
  bands: ToneCell[];
  grain: ToneCell[];
  bevel: ToneCell[];
}

export interface TextureMetrics {
  width: number;
  height: number;
}

/** 3pt cells: chunky enough to read as pixel art, with no marks to cross the letter or points. */
export const TEXTURE_CELL = 3;
const BEVEL_CELLS = 1;
const BAND_COUNT = 4;
const GRAIN_RATE = 0.1;

/** FNV-1a: `t-11` and `t-12` land far apart, which is all a seed needs. */
export function hashTileId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function generateTileTexture(
  seed: number,
  metrics: TextureMetrics,
  cell: number = TEXTURE_CELL,
): TileTexture {
  const cols = Math.round(metrics.width / cell);
  const rows = Math.round(metrics.height / cell);
  const chamfer = 2;

  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const dx = Math.min(x, cols - 1 - x);
    const dy = Math.min(y, rows - 1 - y);
    return dx + dy >= chamfer;
  };

  const bands: ToneCell[] = [];
  const bevel: ToneCell[] = [];
  const grain: ToneCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!inside(x, y)) continue;

      // Light falls from the top left: the face steps down in flat bands, dithered on a
      // checkerboard where one band hands over to the next.
      const t = (x / cols) * 0.45 + (y / rows) * 0.55;
      const scaled = t * BAND_COUNT;
      let band = Math.min(BAND_COUNT - 1, Math.floor(scaled));
      if (scaled - band > 0.72 && (x + y) % 2 === 0) band = Math.min(BAND_COUNT - 1, band + 1);
      bands.push({ x, y, tone: `band${band}` as Tone });

      const rim = rimTone(x, y, inside);
      if (rim) {
        bevel.push({ x, y, tone: rim });
        continue;
      }

      const roll = cellNoise(seed, x, y);
      if (roll < GRAIN_RATE / 2) grain.push({ x, y, tone: "grainLight" });
      else if (roll < GRAIN_RATE) grain.push({ x, y, tone: "grainDark" });
    }
  }

  return { cols, rows, cell, bands, grain, bevel };
}

/** The rim: light where the face meets the top or left, dark on the bottom and right. */
function rimTone(
  x: number,
  y: number,
  inside: (x: number, y: number) => boolean,
): Tone | null {
  for (let d = 1; d <= BEVEL_CELLS; d += 1) {
    if (!inside(x - d, y) || !inside(x, y - d)) return "bevelLight";
  }
  for (let d = 1; d <= BEVEL_CELLS; d += 1) {
    if (!inside(x + d, y) || !inside(x, y + d)) return "bevelEdge";
  }
  return null;
}

/** An independent roll per cell, so neighbouring cells never share a pattern. */
function cellNoise(seed: number, x: number, y: number): number {
  return createRng((seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0)();
}

