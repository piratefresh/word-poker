import { screenScale, stageMaxWidth } from "./screen-scale";

describe("screenScale", () => {
  test("is exactly 1 for a phone, upright or on its side", () => {
    expect(screenScale({ width: 390, height: 844 })).toBe(1);
    expect(screenScale({ width: 844, height: 390 })).toBe(1);
    expect(screenScale({ width: 599, height: 1200 })).toBe(1);
  });

  test("grows with the window and stops at its cap", () => {
    const sizes = [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ];
    const scales = sizes.map(screenScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBeCloseTo(1.25);
    expect(scales[3]).toBe(1.6);
    expect(screenScale({ width: 5000, height: 4000 })).toBe(1.6);
  });
});

describe("stageMaxWidth", () => {
  test("leaves a phone's column alone", () => {
    expect(stageMaxWidth({ width: 844, height: 390 })).toBeUndefined();
  });

  test("bounds a desktop's column, wider as the window grows", () => {
    const small = stageMaxWidth({ width: 1280, height: 720 });
    const large = stageMaxWidth({ width: 2560, height: 1440 });
    expect(small).toBeDefined();
    expect(large).toBeGreaterThan(small as number);
  });
});
