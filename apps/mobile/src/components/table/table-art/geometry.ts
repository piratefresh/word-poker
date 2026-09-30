import { createRng } from "@wordpoker/game-rules";

/**
 * The parlor table as numbers: a rounded-rect top of wood planks, gold bands over the seams (none
 * at the compass points, where the seats sit), a front wall on the near side and the felt sunk inside the rail — laid
 * out for one box size. Pure and Skia-free (`paint.ts` turns it into pixels), so
 * the table resizes by regenerating it, and the tests can read the layout directly.
 *
 * It is modelled on the table's own plane and seen at a fixed tilt: plane x is screen x, plane y
 * (toward the viewer) is foreshortened by `FORESHORTEN`, and a height z lifts a point up the
 * screen by `z * LIFT`. Every size — rail, bands, wall — is a share of `unit`, the plane's short
 * side, so a small table and a tall one keep the same proportions.
 *
 * All output points are screen points with the origin at the top-left of the table top's box
 * (`width` × `height`); the bands, the wall and the shadow reach past it by `bounds`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Face {
  points: Point[];
  /** Light on the face, 0 (turned from the lamp) … 1 (square to it). */
  shade: number;
}

/** A gold band standing on the rail, as the faces the viewer can see. */
export interface Block {
  /** The sides that face the viewer, each running down to whatever it stands on. */
  sides: Face[];
  top: Face;
  /** Across the block along the rail, trailing edge to leading edge, at the top's height. */
  axis: [Point, Point];
}

export interface Plank {
  /** The plank's stretch of the rail top. */
  top: Point[];
  /** Its stretch of the front wall, or null for a plank on the far side. */
  wall: Point[] | null;
  /** A nudge of the wood's brightness, −1 … 1, so neighbouring planks differ. */
  tone: number;
}

export interface GrainLine {
  points: Point[];
  light: boolean;
  alpha: number;
  width: number;
}

export interface TableArtGeometry {
  width: number;
  height: number;
  /** The plane's short side in points: every other size is a share of it. */
  unit: number;
  /** Rail thickness in points, across the table's ends. */
  rail: number;
  /** Everything the painter draws, shadow included. */
  bounds: Rect;
  shadow: { points: Point[]; blur: number };
  /** The rail's front wall on the near side, with its light sampled left to right. */
  wall: {
    points: Point[];
    top: Point[];
    bottom: Point[];
    shades: { x: number; shade: number }[];
  };
  railOuter: Point[];
  railInner: Point[];
  /** A loop along the rail top where its rounded profile catches the light. */
  gloss: Point[];
  planks: Plank[];
  grain: GrainLine[];
  wallGrain: GrainLine[];
  felt: {
    /** The rail's inner edge; the felt inside is clipped to it. */
    lip: Point[];
    surface: Point[];
    stripe: Point[];
    stripeWidth: number;
    center: Point;
    radius: Point;
  };
  bands: Block[];
}

export interface TableArtOptions {
  /** Rail thickness in points across the table's ends; defaults to a tenth of `unit`. */
  railWidth?: number;
  /** Picks the grain and the plank tones. */
  seed?: number;
}

/** How much the plane's depth shrinks on screen, and how far up a height lifts. */
const FORESHORTEN = 0.8;
const LIFT = 0.6;

/** Corner radius as a share of half the short side; 1 would round the ends off completely. */
const CORNER = 0.86;
const RAIL = 0.1;
const MAX_RAIL = 0.24;
const WALL = 0.1;
/** How far the felt sits below the rail top, which shows as a lip on the far side. */
const FELT_DROP = 0.018;
const STRIPE_INSET = 0.04;
/** Where across the rail (from its outer edge) its rounded top is brightest. */
const GLOSS = 0.36;

const BAND_WIDTH = 0.046;
const BAND_OVERHANG = 0.008;
const BAND_RISE = 0.014;

/** A plank's preferred length: a longer run of rail is split into more of them. */
const PLANK_LENGTH = 0.5;
/** Points between grain lines. */
const GRAIN_GAP = 3.5;

const SHADOW_OUT = 0.015;
const SHADOW_DROP = 0.012;
const SHADOW_BLUR = 0.012;

/** Arc sampling step in radians. */
const ARC_STEP = Math.PI / 60;
const TAU = Math.PI * 2;

/** The lamp: over the viewer's left shoulder, mostly overhead. */
const LIGHT = normalize3({ x: -0.45, y: 0.22, z: 0.87 });
const AMBIENT = 0.3;

/**
 * How far the art reaches past the table top's box on each side, as shares of `unit`: the far
 * bands above, the shadow left and right, the wall, its bands and the shadow below. A container
 * that leaves this much room never clips the table.
 */
export const TABLE_ART_BLEED = {
  top: BAND_OVERHANG * FORESHORTEN + BAND_RISE * LIFT,
  side: Math.max(BAND_OVERHANG, SHADOW_OUT + SHADOW_BLUR * 3),
  bottom: Math.max(
    BAND_OVERHANG * FORESHORTEN + WALL * LIFT,
    SHADOW_OUT * FORESHORTEN + WALL * LIFT + SHADOW_DROP + SHADOW_BLUR * 3,
  ),
} as const;

/** The `unit` a table top `width` × `height` points is laid out in. */
export function tableArtUnit(width: number, height: number): number {
  return Math.min(width, height / FORESHORTEN);
}

interface Vec {
  x: number;
  y: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Piece =
  | { kind: "line"; start: number; length: number; from: Vec; dir: Vec }
  | { kind: "arc"; start: number; length: number; center: Vec; angle: number };

/** The table top's outer edge, walked clockwise from its far centre, by arc length. */
interface Outline {
  pieces: Piece[];
  perimeter: number;
  radius: number;
}

function makeOutline(halfW: number, halfD: number, radius: number): Outline {
  const lx = 2 * (halfW - radius);
  const ly = 2 * (halfD - radius);
  const quarter = (Math.PI / 2) * radius;
  const pieces: Piece[] = [];
  let start = 0;
  const line = (from: Vec, dir: Vec, length: number) => {
    pieces.push({ kind: "line", start, length, from, dir });
    start += length;
  };
  const arc = (center: Vec, angle: number) => {
    pieces.push({ kind: "arc", start, length: quarter, center, angle });
    start += quarter;
  };
  line({ x: 0, y: -halfD }, { x: 1, y: 0 }, lx / 2);
  arc({ x: lx / 2, y: -ly / 2 }, -Math.PI / 2);
  line({ x: halfW, y: -ly / 2 }, { x: 0, y: 1 }, ly);
  arc({ x: lx / 2, y: ly / 2 }, 0);
  line({ x: lx / 2, y: halfD }, { x: -1, y: 0 }, lx);
  arc({ x: -lx / 2, y: ly / 2 }, Math.PI / 2);
  line({ x: -halfW, y: ly / 2 }, { x: 0, y: -1 }, ly);
  arc({ x: -lx / 2, y: -ly / 2 }, Math.PI);
  line({ x: -lx / 2, y: -halfD }, { x: 1, y: 0 }, lx / 2);
  return { pieces, perimeter: start, radius };
}

function wrap(s: number, perimeter: number) {
  return ((s % perimeter) + perimeter) % perimeter;
}

/** The piece `s` (already wrapped) falls on. Zero-length pieces never match. */
function pieceAt(outline: Outline, s: number): Piece {
  for (const piece of outline.pieces) {
    if (s < piece.start + piece.length) return piece;
  }
  return outline.pieces[outline.pieces.length - 1];
}

/** The outer edge's point and outward normal at arc length `s`. */
function frameAt(outline: Outline, s: number): { point: Vec; normal: Vec } {
  const at = wrap(s, outline.perimeter);
  const piece = pieceAt(outline, at);
  const local = at - piece.start;
  if (piece.kind === "line") {
    return {
      point: { x: piece.from.x + piece.dir.x * local, y: piece.from.y + piece.dir.y * local },
      normal: { x: piece.dir.y, y: -piece.dir.x },
    };
  }
  const a = piece.angle + local / outline.radius;
  const normal = { x: Math.cos(a), y: Math.sin(a) };
  return {
    point: {
      x: piece.center.x + normal.x * outline.radius,
      y: piece.center.y + normal.y * outline.radius,
    },
    normal,
  };
}

/**
 * Samples `pointAt` along the outline from `from` to `to` (arc length, `to` > `from`): every
 * piece boundary, the arcs finely, and the straights every `maxStep` (only their ends for a
 * clean edge, `Infinity`).
 */
function sampleAlong(
  outline: Outline,
  from: number,
  to: number,
  maxStep: number,
  pointAt: (s: number) => Point,
): Point[] {
  const points = [pointAt(from)];
  let s = from;
  while (to - s > 1e-6) {
    const at = wrap(s, outline.perimeter);
    const piece = pieceAt(outline, at);
    const pieceEnd = s + (piece.start + piece.length - at);
    const step =
      piece.kind === "arc" ? Math.min(maxStep, outline.radius * ARC_STEP) : maxStep;
    s = Math.min(to, pieceEnd, s + step);
    points.push(pointAt(s));
  }
  return points;
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function shadeOf(normal: Vec3): number {
  const n = normalize3(normal);
  const lambert = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
  return AMBIENT + (1 - AMBIENT) * Math.max(0, lambert);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** What a band's side stands on, by how far out from the rail's outer edge it is. */
interface Ground {
  outside: number;
  rail: number;
  felt: number;
}

/** Where a band sits on the rail: the outer edge's point there, along it, and out from it. */
interface Frame {
  origin: Vec;
  t: Vec;
  n: Vec;
}

/**
 * Lays out a table top `width` × `height` points (the box the seats are placed in): its outer
 * rail edge fills the box, and the bands, wall and shadow reach past it by `bounds`.
 */
export function generateTableArt(
  width: number,
  height: number,
  options: TableArtOptions = {},
): TableArtGeometry {
  const halfW = width / 2;
  const halfD = height / FORESHORTEN / 2;
  const unit = tableArtUnit(width, height);
  const rail = clamp(options.railWidth ?? unit * RAIL, 1, unit * MAX_RAIL);
  const radius = (CORNER * unit) / 2;
  const outline = makeOutline(halfW, halfD, radius);
  const perimeter = outline.perimeter;
  const rng = createRng((options.seed ?? 1) >>> 0);

  const project = (p: Vec, z: number): Point => ({
    x: halfW + p.x,
    y: height / 2 + p.y * FORESHORTEN - z * LIFT,
  });
  /** A point `offset` out from the outer edge (negative is inward), `z` above the rail top. */
  const edge = (s: number, offset: number, z: number): Point => {
    const { point, normal } = frameAt(outline, s);
    return project({ x: point.x + normal.x * offset, y: point.y + normal.y * offset }, z);
  };
  const loop = (offset: number, z: number) =>
    sampleAlong(outline, 0, perimeter, Infinity, (s) => edge(s, offset, z));
  const strip = (from: number, to: number, outer: (s: number) => Point, inner: (s: number) => Point) => [
    ...sampleAlong(outline, from, to, Infinity, outer),
    ...sampleAlong(outline, from, to, Infinity, inner).reverse(),
  ];

  const lx = 2 * (halfW - radius);
  const ly = 2 * (halfD - radius);
  const quarterArc = (Math.PI / 2) * radius;
  const wallDepth = WALL * unit;
  const feltZ = -FELT_DROP * unit;

  // A seam at each compass point — far, right, near, left — keeps the rail symmetric; each
  // quarter between them is split into planks near `PLANK_LENGTH` long, with a band over every
  // seam but the four at the compass points, which stay bare wood so no band sits under a seat.
  const east = lx / 2 + quarterArc + ly / 2;
  const compass = [0, east, perimeter / 2, perimeter / 2 + east, perimeter];
  const bandHalf = (BAND_WIDTH * unit) / 2;
  const seams: number[] = [];
  const bandSeams: number[] = [];
  const plankRanges: [number, number][] = [];
  for (let k = 0; k < 4; k += 1) {
    const from = compass[k];
    const to = compass[k + 1];
    const count = Math.max(1, Math.round((to - from) / (PLANK_LENGTH * unit)));
    for (let i = 0; i < count; i += 1) {
      const start = from + ((to - from) * i) / count;
      seams.push(start);
      if (i > 0) bandSeams.push(start);
      plankRanges.push([start, from + ((to - from) * (i + 1)) / count]);
    }
  }

  // The front wall runs round the near side: from where the right end starts to curve toward
  // the viewer to where the left end stops. Past those, the wall is edge-on.
  const wallFrom = lx / 2 + quarterArc + ly;
  const wallTo = wallFrom + 2 * quarterArc + lx;
  const wallTop = sampleAlong(outline, wallFrom, wallTo, Infinity, (s) => edge(s, 0, 0));
  const wallBottom = sampleAlong(outline, wallFrom, wallTo, Infinity, (s) =>
    edge(s, 0, -wallDepth),
  );
  const wallShades = Array.from({ length: 13 }, (_, i) => {
    const s = wallFrom + ((wallTo - wallFrom) * i) / 12;
    const { normal } = frameAt(outline, s);
    return { x: edge(s, 0, 0).x, shade: shadeOf({ x: normal.x, y: normal.y, z: 0 }) };
  }).reverse();

  const grainStep = Math.max(2, rail * 0.25);
  const lineCount = (depth: number, min: number, max: number) =>
    clamp(Math.round(depth / GRAIN_GAP), min, max);
  const grainLine = (points: Point[]): GrainLine => ({
    points,
    light: rng() < 0.3,
    alpha: 0.1 + rng() * 0.22,
    width: Math.max(0.5, rail * (0.012 + rng() * 0.03)),
  });
  /** A gentle two-wave wobble, so no two grain lines run parallel. */
  const wobble = (amp: number, wave: number) => {
    const phase = rng() * TAU;
    return (s: number) =>
      amp * Math.sin((TAU * s) / wave + phase) +
      amp * 0.5 * Math.sin((TAU * s) / (wave * 0.37) + phase * 1.7);
  };

  const planks: Plank[] = [];
  const grain: GrainLine[] = [];
  const wallGrain: GrainLine[] = [];
  for (const [from, to] of plankRanges) {
    const wallStart = Math.max(from, wallFrom);
    const wallEnd = Math.min(to, wallTo);
    const onWall = wallEnd > wallStart;
    planks.push({
      top: strip(from, to, (s) => edge(s, 0, 0), (s) => edge(s, -rail, 0)),
      wall: onWall
        ? strip(wallStart, wallEnd, (s) => edge(s, 0, 0), (s) => edge(s, 0, -wallDepth))
        : null,
      tone: rng() * 2 - 1,
    });

    const span = to - from;
    const lines = lineCount(rail, 3, 9);
    for (let i = 0; i < lines; i += 1) {
      const base = (-rail * (i + 0.5 + (rng() - 0.5) * 0.7)) / lines;
      const wave = wobble(rail * (0.01 + rng() * 0.03), rail * (1.5 + rng() * 3));
      const start = from + (rng() < 0.4 ? rng() * span * 0.4 : 0);
      const end = to - (rng() < 0.4 ? rng() * span * 0.4 : 0);
      grain.push(
        grainLine(
          sampleAlong(outline, start, end, grainStep, (s) =>
            edge(s, clamp(base + wave(s - from), -rail, 0), 0),
          ),
        ),
      );
    }

    if (onWall) {
      const wallLines = lineCount(wallDepth * LIFT, 2, 6);
      for (let i = 0; i < wallLines; i += 1) {
        const base = (-wallDepth * (i + 0.5 + (rng() - 0.5) * 0.6)) / wallLines;
        const wave = wobble(wallDepth * (0.01 + rng() * 0.03), rail * (1.5 + rng() * 3));
        wallGrain.push(
          grainLine(
            sampleAlong(outline, wallStart, wallEnd, grainStep, (s) =>
              edge(s, 0, clamp(base + wave(s - from), -wallDepth, 0)),
            ),
          ),
        );
      }
    }
  }

  const frameOf = (s: number): Frame => {
    const { point, normal } = frameAt(outline, s);
    return { origin: point, n: normal, t: { x: -normal.y, y: normal.x } };
  };
  const groundAt = (ground: Ground, v: number) =>
    v > 0 ? ground.outside : v >= -rail ? ground.rail : ground.felt;

  /**
   * A prism standing on the rail at `frame`: `local` is its top outline as (along, out) pairs,
   * `zTop` its height. Each side facing the viewer runs down to what is under it — the wall's
   * foot outside the rail, the rail top over the rail, the felt inside it.
   */
  const block = (
    frame: Frame,
    local: Vec[],
    zTop: number,
    ground: Ground,
    axis: [Vec, Vec],
  ): Block => {
    const toPlane = (u: number, v: number): Vec => ({
      x: frame.origin.x + frame.t.x * u + frame.n.x * v,
      y: frame.origin.y + frame.t.y * u + frame.n.y * v,
    });
    let corners = local.map((p) => ({ plane: toPlane(p.x, p.y), v: p.y }));
    // Clockwise on screen (y down), so an edge's outward normal is (dy, −dx).
    let area = 0;
    for (let i = 0; i < corners.length; i += 1) {
      const a = corners[i].plane;
      const b = corners[(i + 1) % corners.length].plane;
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) corners = corners.reverse();

    const sides: Face[] = [];
    for (let i = 0; i < corners.length; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const dx = b.plane.x - a.plane.x;
      const dy = b.plane.y - a.plane.y;
      const len = Math.hypot(dx, dy) || 1;
      const normal = { x: dy / len, y: -dx / len };
      if (normal.y <= 0.02) continue;

      // Down the far corner, back along the footing — stepping where it crosses the rail's
      // edges — and up the near one.
      const footing: Point[] = [project(b.plane, groundAt(ground, b.v))];
      const crossings = [0, -rail]
        .map((level) => ({ level, t: (level - b.v) / (a.v - b.v) }))
        .filter(({ t }) => t > 0 && t < 1)
        .sort((p, q) => p.t - q.t);
      for (const { level, t } of crossings) {
        const at = {
          x: b.plane.x + (a.plane.x - b.plane.x) * t,
          y: b.plane.y + (a.plane.y - b.plane.y) * t,
        };
        const towardB = level + Math.sign(b.v - level) * 1e-6;
        const towardA = level + Math.sign(a.v - level) * 1e-6;
        footing.push(project(at, groundAt(ground, towardB)), project(at, groundAt(ground, towardA)));
      }
      footing.push(project(a.plane, groundAt(ground, a.v)));
      sides.push({
        points: [project(a.plane, zTop), project(b.plane, zTop), ...footing],
        shade: shadeOf({ x: normal.x, y: normal.y, z: 0 }),
      });
    }

    return {
      sides,
      top: {
        points: corners.map((c) => project(c.plane, zTop)),
        shade: shadeOf({ x: 0, y: 0, z: 1 }),
      },
      axis: [project(toPlane(axis[0].x, axis[0].y), zTop), project(toPlane(axis[1].x, axis[1].y), zTop)],
    };
  };

  const bandOver = BAND_OVERHANG * unit;
  const bandMid = -rail / 2;
  const bands = bandSeams.map((s) => {
    const frame = frameOf(s);
    // A band wraps down the wall only where the wall faces the viewer; elsewhere the wall is
    // behind the rail or edge-on, and its outside stops at the rail top like the rest of it.
    const outside = frame.n.y > 0.05 ? -wallDepth : 0;
    return block(
      frame,
      [
        { x: -bandHalf, y: bandOver },
        { x: bandHalf, y: bandOver },
        { x: bandHalf, y: -rail - bandOver },
        { x: -bandHalf, y: -rail - bandOver },
      ],
      BAND_RISE * unit,
      { outside, rail: 0, felt: feltZ },
      [
        { x: -bandHalf, y: bandMid },
        { x: bandHalf, y: bandMid },
      ],
    );
  });

  const shadowBlur = SHADOW_BLUR * unit;
  const shadow = loop(SHADOW_OUT * unit, -wallDepth).map((p) => ({
    x: p.x,
    y: p.y + SHADOW_DROP * unit,
  }));

  const railOuter = loop(0, 0);
  const railInner = loop(-rail, 0);

  // Everything the painter draws, with the shadow's blur, and a point of room for antialiasing.
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = height;
  const reach = (points: readonly Point[], pad = 0) => {
    for (const p of points) {
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    }
  };
  reach(shadow, shadowBlur * 3);
  reach(wallBottom);
  reach(railOuter);
  for (const b of bands) {
    for (const face of [...b.sides, b.top]) reach(face.points);
  }
  minX = Math.floor(minX - 1);
  minY = Math.floor(minY - 1);

  return {
    width,
    height,
    unit,
    rail,
    bounds: {
      x: minX,
      y: minY,
      width: Math.ceil(maxX + 1) - minX,
      height: Math.ceil(maxY + 1) - minY,
    },
    shadow: { points: shadow, blur: shadowBlur },
    wall: {
      points: [...wallTop, ...[...wallBottom].reverse()],
      top: wallTop,
      bottom: wallBottom,
      shades: wallShades,
    },
    railOuter,
    railInner,
    gloss: loop(-rail * GLOSS, 0),
    planks,
    grain,
    wallGrain,
    felt: {
      lip: railInner,
      surface: loop(-rail, feltZ),
      stripe: loop(-rail - STRIPE_INSET * unit, feltZ),
      stripeWidth: Math.max(0.75, unit * 0.004),
      center: project({ x: 0, y: 0 }, feltZ),
      radius: { x: halfW - rail, y: (halfD - rail) * FORESHORTEN },
    },
    bands,
  };
}
