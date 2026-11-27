/** Premium cells (§48, Premium cells): the board's pattern, where a spin lands them, and which refuse swaps. */

import type { SlotSpellerConfig } from "./config";
import { wrap } from "./reels";
import { slotRng } from "./seed";
import type { SlotCell, SlotSpellerState } from "./state";

export type SlotCellKind = "letter" | "word";

/** A premium cell of the grid: it multiplies the tile on it (`letter`) or every word covering it (`word`). */
export interface SlotPremiumCell {
  readonly reel: number;
  readonly row: number;
  readonly kind: SlotCellKind;
  readonly multiplier: number;
}

/**
 * What the board's pattern draws at `reel`, `row`, or null for a plain cell. Diagonals sit
 * `diagonalSpacing` reels apart; even rows (1, 3, 5 to the player) hold letter cells and odd
 * rows word cells. Every second diagonal's letter cells are triples, and one diagonal's word
 * cells are. The pattern has no edge: the grid in play shows the part it covers.
 */
export function patternCell(
  config: SlotSpellerConfig,
  reel: number,
  row: number,
): Pick<SlotPremiumCell, "kind" | "multiplier"> | null {
  const { diagonalSpacing, letterMultiplier, tripleLetterMultiplier, wordMultiplier, tripleWordMultiplier, tripleWordDiagonal } =
    config.cells;
  const offset = reel - row - 1;
  if (wrap(offset, diagonalSpacing) !== 0) return null;
  const diagonal = Math.floor(offset / diagonalSpacing);
  if (row % 2 === 1) {
    return { kind: "word", multiplier: diagonal === tripleWordDiagonal ? tripleWordMultiplier : wordMultiplier };
  }
  return { kind: "letter", multiplier: diagonal % 2 === 0 ? letterMultiplier : tripleLetterMultiplier };
}

/**
 * Lays the premium cells of a `reels` × `rows` grid. Each row holds the cells the pattern draws
 * on that part of the board. When cells move, each lands on a random reel of its row that is not
 * held, from the run's next cell generator; a held reel (`state.holds`) keeps the cells it has.
 * Returns the cells and the advanced roll counter.
 */
export function rollCells(
  state: Pick<SlotSpellerState, "seed" | "config" | "holds" | "cells" | "cellRolls">,
  reels: number,
  rows: number,
): { cells: SlotPremiumCell[]; cellRolls: number } {
  const { layout, moving } = state.config.cells;
  const cells: SlotPremiumCell[] = [];
  if (layout === "none") return { cells, cellRolls: state.cellRolls };

  const rng = slotRng(state.seed, "cells", state.cellRolls);
  for (let row = 0; row < rows; row += 1) {
    const need: Pick<SlotPremiumCell, "kind" | "multiplier">[] = [];
    for (let reel = 0; reel < reels; reel += 1) {
      const drawn = patternCell(state.config, reel, row);
      if (drawn === null) continue;
      if (moving) need.push(drawn);
      else cells.push({ reel, row, ...drawn });
    }

    for (const held of state.cells) {
      if (held.row !== row || held.reel >= reels || !state.holds.includes(held.reel)) continue;
      const match = need.findIndex((cell) => cell.kind === held.kind && cell.multiplier === held.multiplier);
      if (match < 0) continue;
      need.splice(match, 1);
      cells.push(held);
    }

    const free = Array.from({ length: reels }, (_, reel) => reel).filter((reel) => !state.holds.includes(reel));
    for (const cell of need) {
      const [reel] = free.splice(Math.floor(rng() * free.length), 1);
      if (reel === undefined) break;
      cells.push({ reel, row, ...cell });
    }
  }

  return { cells, cellRolls: state.cellRolls + 1 };
}

export function cellAt(cells: readonly SlotPremiumCell[], [reel, row]: SlotCell): SlotPremiumCell | undefined {
  return cells.find((cell) => cell.reel === reel && cell.row === row);
}

/** Whether the tile on `cell` cannot be swapped in or out: only a nudge changes its letter. */
export function isSwapLocked(state: Pick<SlotSpellerState, "config" | "cells">, cell: SlotCell): boolean {
  const { swapLock } = state.config.cells;
  const premium = cellAt(state.cells, cell);
  if (premium === undefined || swapLock === "none") return false;
  return swapLock === "all" || premium.kind === "word";
}
