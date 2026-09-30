import {
  BlendMode,
  BlurStyle,
  ClipOp,
  FillType,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
  type SkCanvas,
  type SkPaint,
  type SkPath,
} from "@shopify/react-native-skia";

import type { Block, GrainLine, Point, TableArtGeometry } from "./geometry";

/** A material from its darkest to its lightest, read by a face's shade (see `rampColor`). */
type Ramp = readonly [deep: string, dark: string, base: string, light: string];

/** Where each ramp colour sits on the 0…1 shade scale. */
const RAMP_STOPS = [0, 0.35, 0.7, 1] as const;

// The parlor table's materials — one-offs from the reference art, not theme tokens.
const WOOD: Ramp = ["#1e0a04", "#4a1b0c", "#7e3820", "#b4603a"];
const GOLD: Ramp = ["#4a3008", "#8a6420", "#d6a23e", "#fbe39a"];
const FELT = {
  hot: "#118653",
  mid: "#0c7246",
  edge: "#064d2e",
  stripe: "rgba(240,206,120,0.85)",
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ramp's colour at `shade` (0…1), blended between its two nearest stops. */
function rampColor(ramp: Ramp, shade: number): string {
  const s = Math.max(0, Math.min(1, shade));
  let i = 0;
  while (i < RAMP_STOPS.length - 2 && s > RAMP_STOPS[i + 1]) i += 1;
  const t = (s - RAMP_STOPS[i]) / (RAMP_STOPS[i + 1] - RAMP_STOPS[i]);
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  const mix = a.map((c, k) => Math.round(c + (b[k] - c) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

function fill(color: string): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  return paint;
}

function stroke(color: string, width: number, blur = 0): SkPaint {
  const paint = fill(color);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  if (blur > 0) paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur, true));
  return paint;
}

function linear(from: Point, to: Point, colors: string[], positions: number[]): SkPaint {
  const paint = fill("#000");
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(from.x, from.y),
      vec(to.x, to.y),
      colors.map((c) => Skia.Color(c)),
      positions,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** Grey noise laid over a surface in overlay mode: it nudges light and dark, never the hue. */
function noise(frequency: number, octaves: number, seed: number, strength: number): SkPaint {
  const paint = fill("#000");
  paint.setShader(Skia.Shader.MakeFractalNoise(frequency, frequency, octaves, seed, 0, 0));
  // The paint's own alpha is applied before the colour filter, so the strength has to be the
  // filter's alpha row: the matrix replaces whatever alpha came in.
  const g = 1 / 3;
  paint.setColorFilter(
    Skia.ColorFilter.MakeMatrix([g, g, g, 0, 0, g, g, g, 0, 0, g, g, g, 0, 0, 0, 0, 0, 0, strength]),
  );
  paint.setBlendMode(BlendMode.Overlay);
  return paint;
}

function poly(points: readonly Point[], close = true): SkPath {
  return Skia.Path.Polygon(points.map((p) => vec(p.x, p.y)), close);
}

function clipped(canvas: SkCanvas, clip: SkPath, draw: () => void) {
  canvas.save();
  canvas.clipPath(clip, ClipOp.Intersect, true);
  draw();
  canvas.restore();
}

function paintGrain(canvas: SkCanvas, lines: readonly GrainLine[]) {
  for (const line of lines) {
    canvas.drawPath(
      poly(line.points, false),
      stroke(
        line.light ? `rgba(255,205,160,${line.alpha * 0.6})` : `rgba(38,12,4,${line.alpha * 1.3})`,
        line.width,
      ),
    );
  }
}

function paintPlankTone(canvas: SkCanvas, points: readonly Point[], tone: number) {
  const color = tone >= 0 ? `rgba(255,220,190,${tone * 0.09})` : `rgba(20,6,0,${-tone * 0.16})`;
  canvas.drawPath(poly(points), fill(color));
}

/**
 * Paints the table onto `canvas` in the geometry's own coordinates (the table top's box at the
 * origin): shadow, front wall, rail, felt, then the gold bands standing on the rail.
 */
export function paintTableArt(canvas: SkCanvas, g: TableArtGeometry): void {
  paintShadow(canvas, g);
  paintWall(canvas, g);
  paintRail(canvas, g);
  paintFelt(canvas, g);
  for (const band of g.bands) paintBand(canvas, band, g.unit);
}

function paintShadow(canvas: SkCanvas, g: TableArtGeometry) {
  const paint = fill("rgba(0,0,0,0.6)");
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, g.shadow.blur, true));
  canvas.drawPath(poly(g.shadow.points), paint);
}

function paintWall(canvas: SkCanvas, g: TableArtGeometry) {
  const { wall } = g;
  const path = poly(wall.points);
  const left = wall.shades[0].x;
  const right = wall.shades[wall.shades.length - 1].x;
  const span = Math.max(1, right - left);
  // The wall turns toward the lamp on the left and away from it on the right; its light is
  // sampled along it, a little darker than a face square to the lamp would be.
  canvas.drawPath(
    path,
    linear(
      { x: left, y: 0 },
      { x: right, y: 0 },
      wall.shades.map((s) => rampColor(WOOD, s.shade * 0.85)),
      wall.shades.map((s) => (s.x - left) / span),
    ),
  );

  const depth = g.unit * 0.06;
  clipped(canvas, path, () => {
    for (const plank of g.planks) if (plank.wall) paintPlankTone(canvas, plank.wall, plank.tone);
    paintGrain(canvas, g.wallGrain);
    // The rounded lip under the rail top catches the light; the foot sinks into shadow.
    canvas.drawPath(poly(wall.top, false), stroke("rgba(255,196,150,0.32)", depth * 0.3, depth * 0.12));
    canvas.drawPath(poly(wall.bottom, false), stroke("rgba(10,3,0,0.55)", depth * 0.7, depth * 0.25));
  });
  canvas.drawPath(poly(wall.bottom, false), stroke("rgba(0,0,0,0.5)", 1));
}

function paintRail(canvas: SkCanvas, g: TableArtGeometry) {
  const path = Skia.PathBuilder.Make()
    .addPoly(g.railOuter.map((p) => vec(p.x, p.y)), true)
    .addPoly(g.railInner.map((p) => vec(p.x, p.y)), true)
    .setFillType(FillType.EvenOdd)
    .detach();

  const corner = { x: 0, y: 0 };
  const far = { x: g.width, y: g.height };
  canvas.drawPath(
    path,
    linear(corner, far, [rampColor(WOOD, 0.82), rampColor(WOOD, 0.7), rampColor(WOOD, 0.58)], [0, 0.5, 1]),
  );

  clipped(canvas, path, () => {
    for (const plank of g.planks) paintPlankTone(canvas, plank.top, plank.tone);
    paintGrain(canvas, g.grain);

    // The rail's rounded top: a soft sheen along its crown, brighter toward the lamp, and shade
    // falling off both edges.
    const sheen = stroke("#000", g.rail * 0.34, g.rail * 0.12);
    sheen.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(corner.x, corner.y),
        vec(far.x, far.y),
        [Skia.Color("rgba(255,222,184,0.5)"), Skia.Color("rgba(255,222,184,0.14)")],
        null,
        TileMode.Clamp,
      ),
    );
    canvas.drawPath(poly(g.gloss), sheen);
    canvas.drawPath(poly(g.railInner), stroke("rgba(25,8,2,0.5)", g.rail * 0.34, g.rail * 0.12));
    canvas.drawPath(poly(g.railOuter), stroke("rgba(25,8,2,0.45)", g.rail * 0.2, g.rail * 0.08));
  });
  canvas.drawPath(poly(g.railOuter), stroke("rgba(0,0,0,0.45)", 1));
}

function paintFelt(canvas: SkCanvas, g: TableArtGeometry) {
  const { felt } = g;
  const lip = poly(felt.lip);
  const surface = poly(felt.surface);

  clipped(canvas, lip, () => {
    // The lip: the rail's inside face, seen only on the far side where the felt drops away.
    canvas.drawPath(
      lip,
      linear({ x: 0, y: 0 }, { x: 0, y: g.height }, [GOLD[1], GOLD[0]], [0, 1]),
    );

    const radial = fill("#000");
    const r = Math.max(1, felt.radius.x);
    radial.setShader(
      Skia.Shader.MakeRadialGradient(
        vec(felt.center.x, felt.center.y),
        r,
        [FELT.hot, FELT.mid, FELT.edge].map((c) => Skia.Color(c)),
        [0, 0.55, 1],
        TileMode.Clamp,
        Skia.Matrix()
          .translate(felt.center.x, felt.center.y)
          .scale(1, felt.radius.y / r)
          .translate(-felt.center.x, -felt.center.y),
      ),
    );
    canvas.drawPath(surface, radial);
    // Nap and a dye's unevenness.
    canvas.drawPath(surface, noise(0.9, 2, 7, 0.3));
    canvas.drawPath(surface, noise(0.012, 3, 11, 0.22));
    // The rail's shadow on the felt.
    canvas.drawPath(surface, stroke("rgba(0,18,8,0.42)", g.rail * 0.5, g.rail * 0.22));

    const stripe = poly(felt.stripe);
    canvas.save();
    canvas.translate(0, felt.stripeWidth * 0.8);
    canvas.drawPath(stripe, stroke("rgba(0,20,10,0.35)", felt.stripeWidth * 1.4));
    canvas.restore();
    canvas.drawPath(stripe, stroke(FELT.stripe, felt.stripeWidth));
  });

  // A gold trim where the wood meets the felt.
  const trim = stroke("#000", Math.max(1, g.unit * 0.007));
  trim.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(0, 0),
      vec(g.width, g.height),
      [GOLD[3], GOLD[2], GOLD[1]].map((c) => Skia.Color(c)),
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(lip, trim);
}

function paintBand(canvas: SkCanvas, band: Block, unit: number) {
  const edge = stroke("rgba(60,34,4,0.55)", Math.max(0.5, unit * 0.002));
  for (const face of band.sides) {
    const path = poly(face.points);
    canvas.drawPath(path, fill(rampColor(GOLD, face.shade)));
    canvas.drawPath(path, edge);
  }
  const top = poly(band.top.points);
  // Brushed metal: dark at the edges, a bright stripe off-centre toward the lamp.
  canvas.drawPath(
    top,
    linear(band.axis[0], band.axis[1], [GOLD[1], GOLD[3], GOLD[2], GOLD[1]], [0, 0.3, 0.65, 1]),
  );
  canvas.drawPath(top, edge);
}
