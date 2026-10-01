import type { OfflineAction } from "@wordpoker/contracts";

import type { BettingBounds } from "./betting";
import { botDecisionSeed, type BotObservation } from "./bot-observation";
import { botProfile } from "./bot-profile";
import { assessBotStrength } from "./bot-strength";
import { buildPots } from "./pots";
import { createRng } from "./rng";

/** Last live actor in the street's order; all-in/folded/sitting-out seats cannot act behind us. */
function isLatePosition(view: BotObservation): boolean {
  const dealt = view.seats.map((seat, index) => ({ seat, index }))
    .filter(({ seat }) => !seat.sittingOut)
    .sort((a, b) => distance(a.index, view.dealerSeat, view.seats.length) -
      distance(b.index, view.dealerSeat, view.seats.length));
  const bigBlindSeat = dealt.length === 2 ? dealt[0]?.index : dealt[1]?.index;
  const anchor = view.phase === "preflop" ? bigBlindSeat ?? view.dealerSeat : view.dealerSeat;
  return !view.seats.some((seat, index) => index !== view.seat &&
    !seat.folded && !seat.allIn && !seat.sittingOut &&
    distance(index, anchor, view.seats.length) > distance(view.seat, anchor, view.seats.length));
}

function distance(seat: number, anchor: number, count: number): number {
  return (seat - anchor + count - 1) % count + 1;
}

/** Personality changes willingness, not the legality or information the seat is given. */
export function decideBotBet(view: BotObservation, bounds: BettingBounds): OfflineAction {
  const actor = view.seats[view.seat];
  if (actor === undefined) throw new Error("bot observation has no acting seat");
  const playerId = actor.id;
  const style = botProfile(view.seat);
  const strength = assessBotStrength(view);
  const opponents = view.seats.filter((seat, index) =>
    index !== view.seat && !seat.folded && !seat.sittingOut);
  const count = Math.max(1, opponents.length);
  const late = isLatePosition(view);
  const call = Math.min(bounds.callAmount, actor.stack);
  const afterCall = view.seats.map((seat, index) => index === view.seat
    ? { ...seat, committedHand: seat.committedHand + call }
    : seat);
  const contestable = buildPots(afterCall)
    .filter((pot) => pot.eligible.includes(view.seat))
    .reduce((sum, pot) => sum + pot.amount, 0);
  const pot = Math.max(0, contestable - call);
  const bb = view.bigBlind;

  // A pot-odds price, not call EV: the largest share of the final pot this tier will pay.
  // Amounts scale with the table and exclude side pots this stack cannot reach.
  const finalPot = pot + call;
  const share = strength.tier === "strong" ? 0.5
    : strength.tier === "playable" ? 0.38
    : view.phase === "preflop" ? 0.2
    : strength.potential ? 0.2
    : strength.hasWord ? 0.16 : 0;
  const floorChips = strength.tier === "strong" ? 4 * bb
    : strength.tier === "playable" || view.phase === "preflop" ? 1.5 * bb
    : strength.potential ? bb : 0;
  const budget = strength.tier === "premium" ? Infinity
    : Math.max(share * finalPot, floorChips);
  const willing = call <= budget * style.curiosity / (1 + (count - 1) * 0.12);
  const actionRoll = createRng(botDecisionSeed(view, "action"))();
  const bluffRoll = createRng(botDecisionSeed(view, "bluff"))();
  const trapRoll = createRng(botDecisionSeed(view, "slow-play"))();
  const sizeRoll = createRng(botDecisionSeed(view, "size"))();
  const strong = strength.tier === "strong" || strength.tier === "premium";
  const valueFrequency = strong ? style.aggression
    : strength.tier === "playable" && (late || view.phase === "preflop") ? style.aggression * 0.3 : 0;
  const raiseRestraint = strength.tier !== "premium" && bounds.currentBet > bb
    ? (actor.committedRound > bb ? 0.2 : 0.5) : 1;
  const value = willing && actionRoll < valueFrequency * raiseRestraint / (1 + (count - 1) * 0.12);
  // Someone all in cannot be bluffed out. Avoid bluffing into crowds or a large re-raise.
  const bluff = !strong && count <= 2 && opponents.every((seat) => !seat.allIn) &&
    call <= Math.max(bb, pot * 0.2) && view.round.lastRaiseSize <= Math.max(bb, pot * 0.35) &&
    bluffRoll < style.bluff * (late ? 1.4 : 0.6) * (strength.potential ? 1.2 : 1) / count;
  const slowPlay = bounds.canCheck && strong && trapRoll < style.slowPlay;
  const wantsWager = (value || bluff) && !slowPlay;

  if (wantsWager && opponents.some((seat) => !seat.allIn)) {
    // Both value and bluffs draw from these overlapping pot fractions.
    const fraction = (sizeRoll < 0.4 ? 0.4 : sizeRoll < 0.8 ? 0.65 : 0.9) * style.sizing;
    const increment = Math.max(bb, Math.round(Math.max(pot + call, 2 * bb) * fraction / bb) * bb);
    const floor = bounds.canBet ? bb : bounds.minRaiseTo;
    const desired = bounds.canBet ? increment : Math.max(floor, bounds.currentBet + increment);
    const effective = Math.max(...opponents.map((seat) => seat.committedRound + seat.stack));
    // Do not put chips into an uncontested excess; the legality floor still takes precedence.
    const amount = Math.min(bounds.maxRaiseTo, Math.max(floor, Math.min(desired, effective)));
    if (bounds.canBet) return { type: "bet", playerId, amount };
    if (bounds.canRaise) return { type: "raise", playerId, amount };
    // A short value all-in is useful, but never bypass action that has not reopened.
    if (strong && bounds.canAllIn && !actor.actedThisRound &&
      bounds.maxRaiseTo > bounds.currentBet && bounds.maxRaiseTo < floor) {
      return { type: "allIn", playerId };
    }
  }
  if (bounds.canCheck) return { type: "check", playerId };
  if (bounds.canCall && willing) return { type: "call", playerId };
  return { type: "fold", playerId };
}
