import { INSERT_COUNT, generateChip, hashTileId } from "./generate";

describe("generateChip", () => {
  it("wears the same chip the same way for the same seed and size", () => {
    const seed = hashTileId("chip-1");
    expect(generateChip(seed, 40, 0.9)).toEqual(generateChip(seed, 40, 0.9));
    expect(generateChip(seed, 40).scratches).not.toEqual(
      generateChip(hashTileId("chip-2"), 40).scratches,
    );
  });

  it("spaces the inserts evenly around the edge", () => {
    const { inserts } = generateChip(7, 40);
    expect(inserts).toHaveLength(INSERT_COUNT);
    const step = (Math.PI * 2) / INSERT_COUNT;
    inserts
      .slice(1)
      .forEach((angle, i) => expect(angle - inserts[i]).toBeCloseTo(step));
  });

  it("gives a face-on chip no wall and a tilted one a squashed face over a wall", () => {
    const flat = generateChip(1, 40);
    expect(flat.depth).toBe(0);
    expect(flat.squash).toBe(1);

    const tilted = generateChip(1, 40, 1);
    expect(tilted.depth).toBeGreaterThan(0);
    expect(tilted.height).toBeLessThan(flat.height);
    expect(
      tilted.cy + tilted.r * tilted.squash + tilted.depth,
    ).toBeLessThanOrEqual(tilted.height);
  });

  it("keeps the wear on the face", () => {
    const { scratches, speckles } = generateChip(3, 40);
    for (const s of scratches) expect(Math.hypot(s.x1, s.y1)).toBeLessThan(1);
    for (const s of speckles) expect(Math.hypot(s.x, s.y)).toBeLessThan(1);
  });
});
