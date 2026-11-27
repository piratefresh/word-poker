/** The run machine (§48, Rounds and the run): paying a spin, the Extra Spin, ending the run, the next round. */

import type { Dictionary } from "../words/dictionary";
import { refuse, type SlotActionResult, type SlotRejectionReason } from "./actions";
import { roundTarget } from "./config";
import { evaluateSlotGrid, type SlotEvaluation } from "./evaluate";
import { rollShopStock } from "./shop";
import type { SlotBestWord, SlotSpellerState } from "./state";

/** A paid spin: the next state plus what the grid paid, so the client animates the same payout. */
export type SlotPayResult =
  | { readonly ok: true; readonly state: SlotSpellerState; readonly payout: SlotEvaluation }
  | { readonly ok: false; readonly state: SlotSpellerState; readonly reason: SlotRejectionReason };

function bestOf(held: SlotBestWord | null, payout: SlotEvaluation): SlotBestWord | null {
  let best = held;
  for (const { word, breakdown } of payout.words) {
    if (best === null || breakdown.score > best.score) best = { word, score: breakdown.score };
  }
  return best;
}

/**
 * Pays the grid into the round score. Reaching the target clears the round — tokens for the clear
 * and each unused spin, and the shop opens; otherwise `between` with spins left, or `short`.
 */
export function pay(state: SlotSpellerState, dictionary: Dictionary): SlotPayResult {
  if (state.phase !== "moving") return { ok: false, state, reason: "wrong-phase" };

  const payout = evaluateSlotGrid(state, dictionary);
  const paid: SlotSpellerState = {
    ...state,
    moves: 0,
    roundScore: state.roundScore + payout.total,
    bestWord: bestOf(state.bestWord, payout),
  };

  if (paid.roundScore >= paid.target) {
    const earned = paid.config.clearTokens + paid.config.tokensPerUnusedSpin * paid.spinsLeft;
    const { stock, shopRolls } = rollShopStock(paid);
    return {
      ok: true,
      payout,
      state: { ...paid, phase: "shop", tokens: paid.tokens + earned, shopRolls, shop: { stock, sold: [], rerolls: 0, earned } },
    };
  }

  return { ok: true, payout, state: { ...paid, phase: paid.spinsLeft > 0 ? "between" : "short" } };
}

/** Out of spins short of the target: buy one more spin, once a round. */
export function buyExtraSpin(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "short") return refuse(state, "wrong-phase");
  if (state.extraSpinUsed) return refuse(state, "extra-spin-used");
  if (state.tokens < state.config.extraSpinCost) return refuse(state, "not-enough-tokens");
  return {
    ok: true,
    state: { ...state, tokens: state.tokens - state.config.extraSpinCost, spinsLeft: 1, extraSpinUsed: true, phase: "between" },
  };
}

/** Short of the target with no Extra Spin taken: the run is over. */
export function endRun(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "short") return refuse(state, "wrong-phase");
  return { ok: true, state: { ...state, phase: "over" } };
}

/** Leaves the shop for the next round; tokens, powers and reels carry. */
export function nextRound(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "shop") return refuse(state, "wrong-phase");
  const round = state.round + 1;
  return {
    ok: true,
    state: {
      ...state,
      round,
      target: roundTarget(state.config, round),
      roundScore: 0,
      spinsLeft: state.config.spinsPerRound,
      extraSpinUsed: false,
      holds: [],
      shop: null,
      phase: "ready",
    },
  };
}
