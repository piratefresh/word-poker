import { pinnedSeed } from "./offline-seed";

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
