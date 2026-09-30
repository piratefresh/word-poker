import { Skia } from "@shopify/react-native-skia";

import type { Tone, TileTexture } from "./generate";

/** Ivory stone, lit from the top left. Grain is a nudge over the band beneath it. */
const TONES: Record<Tone, string> = {
  band0: "#fdf3d8",
  band1: "#f5e6c2",
  band2: "#ecd9ae",
  band3: "#e0c998",
  bevelLight: "#fffaec",
  bevelEdge: "#9c7a47",
  grainLight: "rgba(255,255,255,0.45)",
  grainDark: "rgba(130,92,44,0.16)",
};

/**
 * Paints a texture's cells onto a raster surface at `dpr` pixels per point, each cell a whole
 * `cell × dpr` rect so its edges land on real pixels, and returns it as a PNG data uri.
 * Returns null when Skia cannot make a surface.
 */
export function paintTileTexture(texture: TileTexture, dpr: number): string | null {
  const px = Math.max(1, Math.round(texture.cell * dpr));
  const surface = Skia.Surface.Make(texture.cols * px, texture.rows * px);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const paints = new Map<Tone, ReturnType<typeof Skia.Paint>>();
  const paintFor = (tone: Tone) => {
    let paint = paints.get(tone);
    if (!paint) {
      paint = Skia.Paint();
      paint.setAntiAlias(false);
      paint.setColor(Skia.Color(TONES[tone]));
      paints.set(tone, paint);
    }
    return paint;
  };
  const fill = (x: number, y: number, tone: Tone) =>
    canvas.drawRect(Skia.XYWHRect(x * px, y * px, px, px), paintFor(tone));

  for (const c of texture.bands) fill(c.x, c.y, c.tone);
  for (const c of texture.grain) fill(c.x, c.y, c.tone);
  for (const c of texture.bevel) fill(c.x, c.y, c.tone);

  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64();
  return base64 ? `data:image/png;base64,${base64}` : null;
}
