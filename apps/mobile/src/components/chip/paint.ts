import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  TileMode,
  vec,
  type SkCanvas,
  type SkPath,
} from "@shopify/react-native-skia";

import { chipTones, type ChipTone } from "@/constants/theme";

import type { ChipGeometry } from "./generate";

/** The spade in a 2×2 box around the origin, point up, stem down. */
const SPADE = Skia.Path.MakeFromSVGString(
  "M0 -1 C0.35 -0.55 1 -0.28 1 0.15 C1 0.5 0.66 0.7 0.36 0.7 C0.2 0.7 0.1 0.62 0.05 0.55 " +
    "L0.26 1 L-0.26 1 L-0.05 0.55 C-0.1 0.62 -0.2 0.7 -0.36 0.7 C-0.66 0.7 -1 0.5 -1 0.15 " +
    "C-1 -0.28 -0.35 -0.55 0 -1 Z",
);

const INSERT_RADIUS = 0.885;
const INSERT_WIDTH = 0.21;
const RING_RADIUS = 0.66;
const DIAMOND_RADIUS = 0.77;
const SPADE_SCALE = 0.34;
const WALL_STEPS = 6;

function fill(color: string) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  return paint;
}

function stroke(color: string, width: number, cap: StrokeCap = StrokeCap.Butt) {
  const paint = fill(color);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(cap);
  return paint;
}

function radial(
  cx: number,
  cy: number,
  r: number,
  colors: string[],
  positions: number[],
) {
  const paint = fill("#000");
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      vec(cx, cy),
      r,
      colors.map((c) => Skia.Color(c)),
      positions,
      TileMode.Clamp,
    ),
  );
  return paint;
}

/** A point on the face's rim, `drop` points below the top face. */
function rim(g: ChipGeometry, angle: number, drop: number) {
  return [
    g.cx + g.r * Math.cos(angle),
    g.cy + drop + g.r * g.squash * Math.sin(angle),
  ] as const;
}

/**
 * Paints one chip onto `canvas` with its top-left at the canvas origin: shadow, wall, face,
 * inserts, ring, emblem, wear and light, in that order. The caller translates the canvas to
 * place it, which is how a stack paints its chips one on another.
 */
export function paintChip(
  canvas: SkCanvas,
  g: ChipGeometry,
  tone: ChipTone,
): void {
  const t = chipTones[tone];
  const faceOval = Skia.XYWHRect(
    g.cx - g.r,
    g.cy - g.r * g.squash,
    g.r * 2,
    g.r * 2 * g.squash,
  );

  // Contact shadow on the felt, under the wall's foot.
  const shadow = fill("rgba(0,0,0,0.38)");
  shadow.setMaskFilter(
    Skia.MaskFilter.MakeBlur(BlurStyle.Normal, g.width * 0.025, true),
  );
  canvas.drawOval(
    Skia.XYWHRect(
      g.cx - g.r * 0.97,
      g.cy - g.r * g.squash + g.depth + g.width * 0.025,
      g.r * 1.94,
      g.r * 2 * g.squash,
    ),
    shadow,
  );

  if (g.depth > 0) paintWall(canvas, g, t);

  // The face, in unit-circle space.
  canvas.save();
  canvas.translate(g.cx, g.cy);
  canvas.scale(g.r, g.r * g.squash);

  canvas.drawCircle(
    0,
    0,
    1,
    radial(-0.35, -0.45, 1.7, [t.light, t.base, t.dark], [0, 0.45, 1]),
  );

  const inserts = Skia.Path.Make();
  const insertOval = Skia.XYWHRect(
    -INSERT_RADIUS,
    -INSERT_RADIUS,
    INSERT_RADIUS * 2,
    INSERT_RADIUS * 2,
  );
  for (const angle of g.inserts) {
    inserts.addArc(
      insertOval,
      toDeg(angle - g.insertHalf),
      toDeg(g.insertHalf * 2),
    );
  }
  canvas.drawPath(inserts, stroke(t.inset, INSERT_WIDTH));

  canvas.drawCircle(0, 0, 0.99, stroke("rgba(0,0,0,0.45)", 0.025));
  canvas.drawCircle(
    0,
    0,
    RING_RADIUS - 0.02,
    radial(0, 0, RING_RADIUS, ["rgba(0,0,0,0)", "rgba(0,0,0,0.16)"], [0.55, 1]),
  );
  canvas.drawCircle(0, 0, RING_RADIUS, stroke(t.ring, 0.04));

  const diamonds = Skia.Path.Make();
  // A diamond halfway between each pair of inserts.
  const between = Math.PI / g.inserts.length;
  for (const angle of g.inserts) {
    const a = angle + between;
    const x = Math.cos(a) * DIAMOND_RADIUS;
    const y = Math.sin(a) * DIAMOND_RADIUS;
    const s = 0.045;
    diamonds.moveTo(x, y - s);
    diamonds.lineTo(x + s * 0.7, y);
    diamonds.lineTo(x, y + s);
    diamonds.lineTo(x - s * 0.7, y);
    diamonds.close();
  }
  canvas.drawPath(diamonds, fill(t.ring));

  if (SPADE) {
    canvas.save();
    canvas.scale(SPADE_SCALE, SPADE_SCALE);
    canvas.drawPath(SPADE, fill(t.emblem));
    canvas.restore();
  }

  // Wear: speckle, a few scratches, and a nudge of brightness so no two chips match.
  for (const s of g.speckles) {
    canvas.drawCircle(
      s.x,
      s.y,
      s.r,
      fill(s.light ? "rgba(255,244,222,0.14)" : "rgba(0,0,0,0.16)"),
    );
  }
  for (const s of g.scratches) {
    canvas.drawLine(
      s.x1,
      s.y1,
      s.x2,
      s.y2,
      stroke(`rgba(255,240,215,${s.alpha})`, 0.012, StrokeCap.Round),
    );
  }
  canvas.drawCircle(
    0,
    0,
    1,
    fill(
      g.brightness >= 0
        ? `rgba(255,255,255,${g.brightness})`
        : `rgba(0,0,0,${-g.brightness})`,
    ),
  );

  // Light over everything painted on the face, inserts included, then the rim's glint.
  canvas.drawCircle(
    0,
    0,
    1,
    radial(
      -0.4,
      -0.5,
      1.8,
      ["rgba(255,255,255,0.16)", "rgba(255,255,255,0)", "rgba(0,0,0,0.28)"],
      [0, 0.45, 1],
    ),
  );
  const glint = Skia.Path.Make();
  glint.addArc(Skia.XYWHRect(-0.93, -0.93, 1.86, 1.86), 200, 55);
  canvas.drawPath(
    glint,
    stroke("rgba(255,255,255,0.32)", 0.045, StrokeCap.Round),
  );

  canvas.restore();

  // A hairline where the face meets the wall.
  if (g.depth > 0)
    canvas.drawOval(
      faceOval,
      stroke("rgba(0,0,0,0.3)", Math.max(0.5, g.width * 0.01)),
    );
}

/** The chip's side: the front half of the band between the face and its copy `depth` below. */
function paintWall(
  canvas: SkCanvas,
  g: ChipGeometry,
  t: (typeof chipTones)[ChipTone],
) {
  const wall = Skia.Path.Make();
  const top = Skia.XYWHRect(
    g.cx - g.r,
    g.cy - g.r * g.squash,
    g.r * 2,
    g.r * 2 * g.squash,
  );
  const bottom = Skia.XYWHRect(top.x, top.y + g.depth, top.width, top.height);
  wall.moveTo(g.cx - g.r, g.cy);
  wall.lineTo(g.cx - g.r, g.cy + g.depth);
  wall.arcToOval(bottom, 180, -180, false);
  wall.lineTo(g.cx + g.r, g.cy);
  wall.arcToOval(top, 0, 180, false);
  wall.close();

  const body = fill("#000");
  body.setShader(
    Skia.Shader.MakeLinearGradient(
      vec(g.cx - g.r, 0),
      vec(g.cx + g.r, 0),
      [t.dark, t.base, t.light, t.base, t.dark].map((c) => Skia.Color(c)),
      [0, 0.25, 0.4, 0.7, 1],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(wall, body);

  // The inserts run down the wall: a cream band under each one that faces the viewer.
  canvas.save();
  canvas.clipPath(wall, ClipOp.Intersect, true);
  const stripes = Skia.Path.Make();
  for (const angle of g.inserts)
    addStripe(stripes, g, angle - g.insertHalf, angle + g.insertHalf);
  canvas.drawPath(stripes, fill(t.inset));
  canvas.drawPath(
    wall,
    (() => {
      const shade = fill("#000");
      shade.setShader(
        Skia.Shader.MakeLinearGradient(
          vec(g.cx - g.r, 0),
          vec(g.cx + g.r, 0),
          [
            "rgba(0,0,0,0.45)",
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.5)",
          ].map((c) => Skia.Color(c)),
          [0, 0.35, 0.6, 1],
          TileMode.Clamp,
        ),
      );
      return shade;
    })(),
  );
  canvas.restore();
}

/** One insert's band down the wall, if any of it is on the near side (angles 0…π, y down). */
function addStripe(path: SkPath, g: ChipGeometry, from: number, to: number) {
  const tau = Math.PI * 2;
  let a = ((from % tau) + tau) % tau;
  let b = a + (to - from);
  // Wrap a band that straddles 0 so it can be clamped to the near half in one piece.
  if (a > Math.PI && b > tau) {
    a -= tau;
    b -= tau;
  }
  a = Math.max(a, 0);
  b = Math.min(b, Math.PI);
  if (b <= a) return;

  for (let i = 0; i <= WALL_STEPS; i += 1) {
    const [x, y] = rim(g, a + ((b - a) * i) / WALL_STEPS, 0);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  for (let i = WALL_STEPS; i >= 0; i -= 1) {
    const [x, y] = rim(g, a + ((b - a) * i) / WALL_STEPS, g.depth);
    path.lineTo(x, y);
  }
  path.close();
}

function toDeg(radians: number) {
  return (radians * 180) / Math.PI;
}

/**
 * Paints a chip on a raster surface at `dpr` pixels per point and returns it as a PNG data uri,
 * or null when Skia cannot make a surface.
 */
export function paintChipImage(
  g: ChipGeometry,
  tone: ChipTone,
  dpr: number,
): string | null {
  const surface = Skia.Surface.Make(
    Math.ceil(g.width * dpr),
    Math.ceil(g.height * dpr),
  );
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(dpr, dpr);
  paintChip(canvas, g, tone);
  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64();
  return base64 ? `data:image/png;base64,${base64}` : null;
}
