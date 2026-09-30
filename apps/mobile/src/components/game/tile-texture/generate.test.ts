import { TILE_METRICS } from "../word-tile";
import { generateTileTexture, hashTileId } from "./generate";

const MEDIUM = TILE_METRICS.medium;

describe("generateTileTexture", () => {
  it("draws the same face for the same tile and size", () => {
    const seed = hashTileId("t-11");
    expect(generateTileTexture(seed, MEDIUM)).toEqual(generateTileTexture(seed, MEDIUM));
    expect(generateTileTexture(seed, MEDIUM)).not.toEqual(
      generateTileTexture(hashTileId("t-12"), MEDIUM),
    );
  });

  it("snaps the medium tile to a 15×17 grid of 3pt cells", () => {
    const texture = generateTileTexture(1, MEDIUM);
    expect([texture.cols, texture.rows]).toEqual([15, 17]);
  });

  it("cuts the corners and leaves the face whole inside them", () => {
    const { bands, cols, rows } = generateTileTexture(1, MEDIUM);
    const filled = new Set(bands.map((c) => `${c.x},${c.y}`));
    expect(filled.has("0,0")).toBe(false);
    expect(filled.has(`${cols - 1},${rows - 1}`)).toBe(false);
    expect(filled.has(`${Math.floor(cols / 2)},${Math.floor(rows / 2)}`)).toBe(true);
  });
});
