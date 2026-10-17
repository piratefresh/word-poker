import { chipBreakdown } from "./chip-breakdown";

describe("chipBreakdown", () => {
  it("draws nothing for an empty bet", () => {
    expect(chipBreakdown(0)).toEqual([]);
    expect(chipBreakdown(-5)).toEqual([]);
  });

  it("makes exact change from the largest colour down, most valuable on top", () => {
    expect(chipBreakdown(137)).toEqual([
      "red",
      "red",
      "blue",
      "blue",
      "green",
      "black",
    ]);
  });

  it("keeps the largest chips when the change would run past the cap", () => {
    // 4 would take four reds; capped at two, the stack keeps two of them.
    expect(chipBreakdown(4, 2)).toEqual(["red", "red"]);
    expect(chipBreakdown(1234, 3)).toEqual(["black", "gold", "gold"]);
  });
});
