import { colors } from "@/constants/theme";

const chips = new Intl.NumberFormat("en-US");

export function signedChips(n: number): string {
  return `${n < 0 ? "−" : "+"}${chips.format(Math.abs(n))}`;
}

export function chipColor(n: number, surface: "card" | "felt"): string {
  if (surface === "felt") return n < 0 ? colors.danger : colors.chipUp;
  return n < 0 ? colors.chipDownOnTile : colors.chipUpOnTile;
}
