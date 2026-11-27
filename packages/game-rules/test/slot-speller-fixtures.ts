/** Hand-built Slot Speller grids for tests. */

import type { Tile } from "@wordpoker/contracts";

import { LETTER_VALUES, createSlotRun, DEFAULT_SLOT_SPELLER_CONFIG, type Letter, type SlotPowerCounts, type SlotPremiumCell, type SlotSpellerState } from "../src/index";

/**
 * One tile from a short spec: `"C"` a letter, `"C2"` / `"C3"` Double / Triple Letter, `"?"` a
 * blank, `"K/Q"` a choice tile.
 */
export function tile(spec: string, id: string): Tile {
  if (spec === "?") return { id, letter: "?", points: 0, blank: true };
  const [first, second] = spec.split("/");
  const letter = (first ?? "").charAt(0) as Letter;
  const points = LETTER_VALUES[letter];
  if (second !== undefined) {
    const alternative = second as Letter;
    return { id, letter, points, alternativeLetter: alternative, alternativePoints: LETTER_VALUES[alternative] };
  }
  const digit = (first ?? "").charAt(1);
  if (digit === "2") return { id, letter, points, multiplier: "double-letter" };
  if (digit === "3") return { id, letter, points, multiplier: "triple-letter" };
  return { id, letter, points };
}

/** A grid from rows top to bottom; each row is a string of plain letters or an array of specs. */
export function gridFromRows(rows: readonly (string | readonly string[])[]): Tile[][] {
  const specs = rows.map((row) => (typeof row === "string" ? [...row] : row));
  const reels = specs[0]?.length ?? 0;
  return Array.from({ length: reels }, (_, reel) =>
    specs.map((row, r) => tile(row[reel] ?? "V", `t${reel}-${r}`)),
  );
}

/** A premium cell from a short spec: `"2L"`, `"3L"`, `"2W"`, `"3W"`. */
export function premium(reel: number, row: number, spec: string): SlotPremiumCell {
  return { reel, row, kind: spec.endsWith("W") ? "word" : "letter", multiplier: Number(spec.charAt(0)) };
}

/** A run in `moving` showing exactly `rows`, with these powers held and only these premium cells. */
export function fixedRun(
  rows: readonly (string | readonly string[])[],
  powers: SlotPowerCounts = {},
  cells: readonly SlotPremiumCell[] = [],
): SlotSpellerState {
  const grid = gridFromRows(rows);
  const config = { ...DEFAULT_SLOT_SPELLER_CONFIG, reels: grid.length, rows: rows.length - (powers.extraRow ?? 0) };
  const run = createSlotRun("fixed", config);
  return { ...run, powers, grid, cells, phase: "moving", moves: config.movesPerSpin };
}
