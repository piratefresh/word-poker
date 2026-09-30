import {
  TABLE_ART_BLEED,
  generateTableArt,
  tableArtUnit,
  type Block,
  type Point,
  type TableArtGeometry,
} from "./geometry";

/** Landscape, small, square, portrait and very wide boxes. */
const SIZES: [number, number][] = [
  [360, 250],
  [180, 124],
  [300, 300],
  [220, 330],
  [720, 250],
];

function blockPoints(block: Block): Point[] {
  return [...block.sides, block.top].flatMap((face) => face.points);
}

function drawnPoints(g: TableArtGeometry): Point[] {
  return [
    ...g.wall.points,
    ...g.railOuter,
    ...g.felt.surface,
    ...g.bands.flatMap(blockPoints),
    ...g.grain.flatMap((line) => line.points),
    ...g.wallGrain.flatMap((line) => line.points),
  ];
}

function centerOf(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function lowest(block: Block): number {
  return Math.max(...block.sides.flatMap((face) => face.points.map((p) => p.y)));
}

describe("generateTableArt", () => {
  it("lays out the same table for the same size and seed", () => {
    expect(generateTableArt(360, 250, { seed: 4 })).toEqual(
      generateTableArt(360, 250, { seed: 4 }),
    );
  });

  it("scales every proportion with the table", () => {
    const small = generateTableArt(200, 140);
    const large = generateTableArt(400, 280);
    expect(large.unit).toBeCloseTo(small.unit * 2);
    expect(large.rail).toBeCloseTo(small.rail * 2);
    expect(large.shadow.blur).toBeCloseTo(small.shadow.blur * 2);
    expect(Math.abs(large.bounds.y - small.bounds.y * 2)).toBeLessThanOrEqual(3);
    expect(large.planks).toHaveLength(small.planks.length);
  });

  it("leaves the compass points bare, where the seats sit", () => {
    const g = generateTableArt(360, 250);
    const centers = g.bands.map((b) => centerOf(b.top.points));
    const at = (x: number, y: number) =>
      centers.some((c) => Math.abs(c.x - x) < 6 && Math.abs(c.y - y) < 6);
    // Each band sits across the middle of the rail.
    const mid = g.rail / 2;
    expect(at(180, mid * 0.8)).toBe(false);
    expect(at(360 - mid, 125)).toBe(false);
    expect(at(180, 250 - mid * 0.8)).toBe(false);
    expect(at(mid, 125)).toBe(false);
  });

  it("splits a longer rail into more planks, with a band over every seam but the ends", () => {
    const short = generateTableArt(360, 250);
    const long = generateTableArt(720, 250);
    expect(long.planks.length).toBeGreaterThan(short.planks.length);
    // The rail is a loop, so there are as many seams as planks; the four compass seams go without.
    for (const g of [short, long]) expect(g.bands).toHaveLength(g.planks.length - 4);
  });

  it("stays inside its bounds and the bleed a container reserves for it", () => {
    for (const [width, height] of SIZES) {
      const g = generateTableArt(width, height);
      const { bounds } = g;
      const unit = tableArtUnit(width, height);
      for (const p of drawnPoints(g)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(bounds.x);
        expect(p.y).toBeGreaterThanOrEqual(bounds.y);
        expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      expect(bounds.x).toBeGreaterThanOrEqual(-TABLE_ART_BLEED.side * unit - 2);
      expect(bounds.y).toBeGreaterThanOrEqual(-TABLE_ART_BLEED.top * unit - 2);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + TABLE_ART_BLEED.side * unit + 2);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        height + TABLE_ART_BLEED.bottom * unit + 2,
      );
    }
  });

  it("fills the box with the rail's outer edge", () => {
    for (const [width, height] of SIZES) {
      const { railOuter } = generateTableArt(width, height);
      const xs = railOuter.map((p) => p.x);
      const ys = railOuter.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(0);
      expect(Math.max(...xs)).toBeCloseTo(width);
      expect(Math.min(...ys)).toBeCloseTo(0);
      expect(Math.max(...ys)).toBeCloseTo(height);
    }
  });

  it("takes a rail width, capped so the felt keeps its room", () => {
    expect(generateTableArt(360, 250, { railWidth: 20 }).rail).toBe(20);
    const capped = generateTableArt(360, 250, { railWidth: 500 });
    expect(capped.rail).toBeLessThan(capped.unit * 0.25);
  });

  it("shows the wall on the near side only, under the rail", () => {
    const g = generateTableArt(360, 250);
    for (const p of g.wall.top) expect(p.y).toBeGreaterThanOrEqual(125 - 1e-9);
    expect(Math.max(...g.wall.bottom.map((p) => p.y))).toBeGreaterThan(250);
  });

  it("runs a near band down the wall and stands a far band on the felt", () => {
    const g = generateTableArt(360, 250);
    const byY = [...g.bands].sort((a, b) => centerOf(a.top.points).y - centerOf(b.top.points).y);
    const far = byY[0];
    const near = byY[byY.length - 1];
    // The near bands sit off-centre now, where the wall curves away, so they wrap part way down.
    expect(lowest(near)).toBeGreaterThan(Math.max(...near.top.points.map((p) => p.y)) + 10);
    expect(lowest(far)).toBeLessThan(g.felt.center.y);
    expect(far.sides.length).toBeGreaterThan(0);
  });
});
