/** What the grid pays right now (§48): every pay line's words and their total. Also the live preview. */

import type { Tile } from "@wordpoker/contracts";

import type { Dictionary } from "../words/dictionary";
import { payLines, type PayLine } from "./lines";
import { payLine, type SlotWord } from "./pay-line";
import { rowCount } from "./reels";
import type { SlotSpellerState } from "./state";

export interface SlotEvaluation {
  readonly words: readonly SlotWord[];
  readonly total: number;
}

/** The lines this state's grid pays. */
export function slotLines(state: SlotSpellerState): PayLine[] {
  return payLines(state.reels, rowCount(state), state.powers, state.zigzagPairs);
}

export function evaluateSlotGrid(state: SlotSpellerState, dictionary: Dictionary): SlotEvaluation {
  const context = { dictionary, config: state.config, powers: state.powers, cells: state.cells };
  const words: SlotWord[] = [];

  for (const line of slotLines(state)) {
    const tiles: Tile[] = [];
    for (const [reel, row] of line.cells) {
      const tile = state.grid[reel]?.[row];
      if (tile !== undefined) tiles.push(tile);
    }
    // A line with a missing cell (a grid mid-resize) pays nothing rather than misaligning its cells.
    if (tiles.length !== line.cells.length) continue;
    words.push(...payLine(tiles, line, context));
  }

  return { words, total: words.reduce((sum, word) => sum + word.breakdown.score, 0) };
}
