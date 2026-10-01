import type { ChipSpriteTone } from "./chip-sprite";

/** Color bands for a marker's total amount, rather than individual chip denominations. */
export function chipToneForAmount(amount: number): ChipSpriteTone {
  if (amount >= 1000) return "gold";
  if (amount >= 500) return "purple";
  if (amount >= 100) return "green";
  if (amount >= 50) return "blue";
  return "red";
}
