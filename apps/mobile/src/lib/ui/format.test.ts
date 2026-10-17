import { formatAmount, formatAmountCompact } from "./format";

describe("formatAmount", () => {
  test.each([
    [0, "$0"],
    [7, "$7"],
    [980, "$980"],
    [1000, "$1,000"],
    [12345, "$12,345"],
    [1250000, "$1,250,000"],
    [-450, "-$450"],
    // Chips are whole units, so a fractional amount floors rather than rounding up
    // into a value the player cannot actually hold.
    [12.9, "$12"],
    [Number.NaN, "$0"],
    [Number.POSITIVE_INFINITY, "$0"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });
});

describe("formatAmountCompact", () => {
  test.each([
    [0, "$0"],
    [981, "$981"],
    [1000, "$1K"],
    [2000, "$2K"],
    [12500, "$12.5K"],
    [999000, "$999K"],
    [3400000, "$3.4M"],
    [1200000000, "$1.2B"],
    [-12500, "-$12.5K"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatAmountCompact(input)).toBe(expected);
  });

  test("never shows a trailing .0 on a whole scale step", () => {
    for (const amount of [1000, 2000, 1_000_000, 2_000_000]) {
      expect(formatAmountCompact(amount)).not.toMatch(/\.0[A-Z]$/);
    }
  });
});
