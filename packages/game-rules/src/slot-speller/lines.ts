/** The pay lines across the grid (§48, Pay lines): every row, plus the Wave and Zigzag shapes. */

import { hasPower, type SlotPowerCounts } from "./powers";
import type { SlotCell } from "./state";

export interface PayLine {
  readonly name: string;
  /** One cell per reel, left to right. */
  readonly cells: readonly SlotCell[];
  /** Whether premium cells count on this line: rows only. */
  readonly premium: boolean;
}

/**
 * The lines a `reels` × `rows` grid pays with these powers. Each Zigzag pair `p` (rows p and
 * p + 1, 0-based) pays its two lines; a pair past the grid's rows pays nothing.
 */
export function payLines(
  reels: number,
  rows: number,
  powers: SlotPowerCounts,
  zigzagPairs: readonly number[] = [],
): PayLine[] {
  const columns = Array.from({ length: reels }, (_, reel) => reel);
  const lines: PayLine[] = [];

  for (let row = 0; row < rows; row += 1) {
    lines.push({ name: `Row ${row + 1}`, premium: true, cells: columns.map((reel): SlotCell => [reel, row]) });
  }

  if (rows < 2) return lines;

  if (hasPower(powers, "wave")) {
    const span = 2 * (rows - 1);
    const wave = (reel: number): number => {
      const k = reel % span;
      return k < rows ? k : span - k;
    };
    lines.push({ name: "Wave", premium: false, cells: columns.map((reel): SlotCell => [reel, wave(reel)]) });
    lines.push({ name: "Wave mirror", premium: false, cells: columns.map((reel): SlotCell => [reel, rows - 1 - wave(reel)]) });
  }

  for (const pair of [...zigzagPairs].sort((a, b) => a - b)) {
    if (pair < 0 || pair >= rows - 1) continue;
    for (const phase of [0, 1]) {
      lines.push({
        premium: false,
        name: `Zigzag ${pair + 1}-${pair + 2}${phase === 0 ? "" : " alt"}`,
        cells: columns.map((reel): SlotCell => [reel, pair + ((reel + phase) % 2)]),
      });
    }
  }

  return lines;
}
