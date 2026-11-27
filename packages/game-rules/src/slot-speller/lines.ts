/** The pay lines across the grid (§48, Pay lines): every row, plus the Wave and Zigzag shapes. */

import { hasPower, type SlotPowerCounts } from "./powers";
import type { SlotCell } from "./state";

export interface PayLine {
  readonly name: string;
  /** One cell per reel, left to right. */
  readonly cells: readonly SlotCell[];
}

/** The lines a `reels` × `rows` grid pays with these powers. */
export function payLines(reels: number, rows: number, powers: SlotPowerCounts): PayLine[] {
  const columns = Array.from({ length: reels }, (_, reel) => reel);
  const lines: PayLine[] = [];

  for (let row = 0; row < rows; row += 1) {
    lines.push({ name: `Row ${row + 1}`, cells: columns.map((reel): SlotCell => [reel, row]) });
  }

  if (rows < 2) return lines;

  if (hasPower(powers, "wave")) {
    const span = 2 * (rows - 1);
    const wave = (reel: number): number => {
      const k = reel % span;
      return k < rows ? k : span - k;
    };
    lines.push({ name: "Wave", cells: columns.map((reel): SlotCell => [reel, wave(reel)]) });
    lines.push({ name: "Wave mirror", cells: columns.map((reel): SlotCell => [reel, rows - 1 - wave(reel)]) });
  }

  if (hasPower(powers, "zigzag")) {
    for (let pair = 0; pair < rows - 1; pair += 1) {
      for (const phase of [0, 1]) {
        lines.push({
          name: `Zigzag ${pair + 1}-${pair + 2}${phase === 0 ? "" : " alt"}`,
          cells: columns.map((reel): SlotCell => [reel, pair + ((reel + phase) % 2)]),
        });
      }
    }
  }

  return lines;
}
