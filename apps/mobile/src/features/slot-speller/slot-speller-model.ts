/**
 * The Slot Speller screen's model (§47): the engine's run state plus the UI state around it — the
 * swap selection, the last payout and how far its reveal has got. Every rule is the engine's; this
 * only routes taps to its actions and keeps a refused action from changing anything.
 */

import {
  buyExtraSpin,
  createSlotRun,
  endRun,
  nextRound,
  nudge,
  pay,
  spin,
  swap,
  type Dictionary,
  type NudgeDirection,
  type SlotActionResult,
  type SlotCell,
  type SlotEvaluation,
  type SlotPowerId,
  type SlotSpellerState,
} from "@wordpoker/game-rules";

export interface SlotSpellerModel {
  readonly state: SlotSpellerState;
  /** The first cell of a swap, waiting for the second tap. */
  readonly selected: SlotCell | null;
  /** What the last pay paid; cleared by the next spin. */
  readonly payout: SlotEvaluation | null;
  /** How many of `payoutRows(payout)` are on screen. */
  readonly revealStep: number;
}

export type SlotSpellerAction =
  | { readonly type: "spin" }
  | { readonly type: "nudge"; readonly reel: number; readonly direction: NudgeDirection }
  | { readonly type: "tapCell"; readonly cell: SlotCell }
  | { readonly type: "pay" }
  | { readonly type: "extraSpin" }
  | { readonly type: "endRun" }
  | { readonly type: "nextRound" }
  | { readonly type: "newRun"; readonly seed: string }
  | { readonly type: "revealNext" }
  | { readonly type: "skipReveal" };

/** One line of the payout list, in reveal order: each word, its triggered powers, then the total. */
export type SlotPayoutRow =
  | { readonly kind: "word"; readonly index: number }
  | { readonly kind: "power"; readonly index: number; readonly power: SlotPowerId }
  | { readonly kind: "total"; readonly total: number };

const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SEED_LENGTH = 6;

/** A fresh run's seed: six characters with no look-alikes (no I, O, 0 or 1). */
export function randomSlotSeed(random: () => number = Math.random): string {
  let seed = "";
  for (let i = 0; i < SEED_LENGTH; i += 1) {
    seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)] ?? "A";
  }
  return seed;
}

export function createSlotModel(state: SlotSpellerState): SlotSpellerModel {
  return { state, selected: null, payout: null, revealStep: 0 };
}

export function payoutRows(payout: SlotEvaluation | null): SlotPayoutRow[] {
  if (payout === null) return [];
  const rows: SlotPayoutRow[] = [];
  payout.words.forEach((word, index) => {
    rows.push({ kind: "word", index });
    for (const power of word.breakdown.triggered) rows.push({ kind: "power", index, power });
  });
  rows.push({ kind: "total", total: payout.total });
  return rows;
}

/** Whether the payout list is still revealing (the outcome waits for it). */
export function isRevealing(model: SlotSpellerModel): boolean {
  return model.payout !== null && model.revealStep < payoutRows(model.payout).length;
}

function sameCell(a: SlotCell, b: SlotCell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** An engine result folded in; a refusal hands back the model itself, so callers can tell. */
function applied(model: SlotSpellerModel, result: SlotActionResult): SlotSpellerModel {
  return result.ok ? { ...model, state: result.state } : model;
}

export function reduceSlotSpeller(
  model: SlotSpellerModel,
  action: SlotSpellerAction,
  dictionary: Dictionary,
): SlotSpellerModel {
  const { state } = model;
  switch (action.type) {
    case "spin": {
      const result = spin(state);
      return result.ok ? createSlotModel(result.state) : model;
    }
    case "nudge": {
      const next = applied(model, nudge(state, action.reel, action.direction));
      return next === model ? model : { ...next, selected: null };
    }
    case "tapCell": {
      if (state.phase !== "moving" || state.moves <= 0) return model;
      if (model.selected === null) return { ...model, selected: action.cell };
      if (sameCell(model.selected, action.cell)) return { ...model, selected: null };
      return { ...applied(model, swap(state, model.selected, action.cell)), selected: null };
    }
    case "pay": {
      const result = pay(state, dictionary);
      return result.ok ? { state: result.state, selected: null, payout: result.payout, revealStep: 0 } : model;
    }
    case "extraSpin":
      return applied(model, buyExtraSpin(state));
    case "endRun":
      return applied(model, endRun(state));
    case "nextRound": {
      const result = nextRound(state);
      return result.ok ? createSlotModel(result.state) : model;
    }
    case "newRun":
      return createSlotModel(createSlotRun(action.seed));
    case "revealNext":
      return isRevealing(model) ? { ...model, revealStep: model.revealStep + 1 } : model;
    case "skipReveal":
      return isRevealing(model) ? { ...model, revealStep: payoutRows(model.payout).length } : model;
  }
}
