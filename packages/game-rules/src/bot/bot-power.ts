import type { PlayerId, PowerUpId } from "@wordpoker/contracts";

import { botDecisionSeed, observeBot } from "./bot-observation";
import { botProfile } from "./bot-profile";
import { assessBotStrength } from "./bot-strength";
import { evaluateBestWord } from "./bot-word";
import { OfflineActionError } from "../core/errors";
import { canUsePower, type OfflineState } from "../table/offline";
import { createRng } from "../core/rng";

/** §44's offer, weighted by the seat's own rack and personality. */
export function chooseBotPower(state: OfflineState, botId: PlayerId): PowerUpId {
  const draw = state.powers?.draw;
  const slot = draw?.slots.find((candidate) => candidate.playerId === botId);
  if (draw?.status !== "open" || slot === undefined || slot.picked !== null || slot.offers.length === 0) {
    throw new OfflineActionError("the seat has no unpicked Power Draw offer");
  }
  const view = observeBot(state, slot.seat, state.betting ?? { currentBet: 0, lastRaiseSize: 0 });
  const vowels = view.privateTiles.filter((tile) =>
    "AEIOU".includes(tile.letter) || ("alternativeLetter" in tile && "AEIOU".includes(tile.alternativeLetter)),
  ).length;
  const hasWord = evaluateBestWord({ available: view.privateTiles, dictionary: view.dictionary }) !== null;
  const weights: Record<PowerUpId, number> = {
    vowel_magnet: vowels === 0 ? 4 : vowels === 1 ? 2 : 1,
    mulligan: hasWord ? 1 : 2,
    random_wild: 0.5 + botProfile(slot.seat).aggression,
  };
  let roll = createRng(botDecisionSeed(view, "power-pick"))() *
    slot.offers.reduce((sum, offer) => sum + weights[offer], 0);
  for (const offer of slot.offers) {
    roll -= weights[offer];
    if (roll < 0) return offer;
  }
  throw new OfflineActionError("the weighted Power Draw has no offer");
}

/** A legal use is a separate action; its result need not improve the current word. */
export function decideBotPowerUse(
  state: OfflineState,
  botId: PlayerId,
  nowMs: number,
): { powerUpId: PowerUpId; tileId: string } | null {
  if (!canUsePower(state, botId, nowMs)) return null;
  const seat = state.seats.findIndex((candidate) => candidate.id === botId);
  const held = state.powers?.held[botId];
  if (seat < 0 || held === undefined) return null;
  const view = observeBot(state, seat, state.betting ?? { currentBet: 0, lastRaiseSize: 0 });
  if (view.privateTiles.length === 0) return null;
  const best = evaluateBestWord({ available: [...view.privateTiles, ...view.board], dictionary: view.dictionary });
  const used = new Set(best?.submission.plays.map((play) => play.tileId) ?? []);
  const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const dead = view.privateTiles.filter((tile) => !used.has(tile.id)).sort(byId);
  const target = dead[0] ?? [...view.privateTiles].sort((a, b) => a.points - b.points || byId(a, b))[0];
  if (target === undefined) return null;
  const base = { weak: 0.7, playable: 0.5, strong: 0.3, premium: 0.15 };
  const probability = Math.min(0.95, base[assessBotStrength(view).tier] * botProfile(seat).curiosity *
    (dead.length > 0 ? 1.3 : 1) * (state.wordWindow?.status === "open" ? 1.3 : 1));
  return createRng(botDecisionSeed(view, "power-use"))() < probability
    ? { powerUpId: held.id, tileId: target.id }
    : null;
}
