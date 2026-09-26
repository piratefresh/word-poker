import type { ChipTone } from "@/constants/theme";

/**
 * What each chip colour is worth on the felt. Display only: the engine counts chips as a
 * number, and this only decides which colours a stack of that number is drawn in.
 */
export const CHIP_DENOMINATIONS: readonly { tone: ChipTone; value: number }[] =
  [
    { tone: "gold", value: 500 },
    { tone: "black", value: 100 },
    { tone: "green", value: 25 },
    { tone: "blue", value: 5 },
    { tone: "red", value: 1 },
  ];

/** The most chips a stack draws: past this the stack stops growing and only its colours change. */
export const CHIP_STACK_CAP = 8;

/**
 * The chips a stack of `amount` is drawn with, bottom to top. Largest denominations first,
 * keeping only the `cap` largest when the exact change would need more, and then turned over
 * so the most valuable chip sits on top where its face shows.
 */
export function chipBreakdown(
  amount: number,
  cap: number = CHIP_STACK_CAP,
): ChipTone[] {
  const chips: ChipTone[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const { tone, value } of CHIP_DENOMINATIONS) {
    while (rest >= value && chips.length < cap) {
      chips.push(tone);
      rest -= value;
    }
  }
  return chips.reverse();
}
