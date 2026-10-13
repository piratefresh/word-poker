import { pinnedPowerUps, pinnedSeed, pinnedTurnMs } from "./offline-seed";

describe("pinnedSeed", () => {
  test("reads the seed a URL names", () => {
    expect(pinnedSeed("20260919")).toBe(20_260_919);
    // A URL hands the param over as written: the spaces around it are the URL's, not a pin.
    expect(pinnedSeed(" 42 ")).toBe(42);
  });

  test("takes the first of a repeated param, as the rest of the app reads one", () => {
    expect(pinnedSeed(["7", "9"])).toBe(7);
  });

  test("is no pin when the URL names nothing", () => {
    expect(pinnedSeed(undefined)).toBeUndefined();
    expect(pinnedSeed("")).toBeUndefined();
    expect(pinnedSeed("  ")).toBeUndefined();
  });

  test("is no pin when the URL names something that is not a number", () => {
    expect(pinnedSeed("not-a-seed")).toBeUndefined();
  });
});

describe("pinnedTurnMs", () => {
  test("reads the clock a URL names, and ignores anything that is not a positive number", () => {
    expect(pinnedTurnMs("300000")).toBe(300_000);
    expect(pinnedTurnMs(["5000", "9"])).toBe(5_000);
    for (const bad of [undefined, "", "0", "-1", "soon"]) expect(pinnedTurnMs(bad)).toBeUndefined();
  });
});

describe("pinnedPowerUps", () => {
  test("reads the Wild table off the URL", () => {
    expect(pinnedPowerUps("wild")).toBe("choose3");
    expect(pinnedPowerUps(" Wild ")).toBe("choose3");
    expect(pinnedPowerUps(["wild", "off"])).toBe("choose3");
  });

  test("is Classic when the URL names no mode, or one it does not know", () => {
    expect(pinnedPowerUps(undefined)).toBe("off");
    expect(pinnedPowerUps("")).toBe("off");
    expect(pinnedPowerUps("chaos")).toBe("off");
    expect(pinnedPowerUps("choose3")).toBe("off");
  });
});
