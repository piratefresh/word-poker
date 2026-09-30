/** Offline betting policy: fair observations, stable personalities, and seeded decisions. */
import type { OfflineAction, PlayerId } from "@wordpoker/contracts";

import { bettingBounds } from "./betting";
import { observeBot } from "./bot-observation";
import { decideBotBet } from "./bot-policy";
import { OfflineActionError } from "./errors";
import type { OfflineState } from "./offline";

export { chooseOfflineWord } from "./bot-word";
export type { ChooseWordOptions } from "./bot-word";

/** Returns one legal move; the adapter still schedules exactly one action per CPU beat. */
export function decideOfflineMove(state: OfflineState, botId: PlayerId): OfflineAction {
  if (state.phase === "payout") return { type: "deal" };
  if (state.wordWindow?.status === "open") {
    throw new OfflineActionError(`${botId} has no word to play: the table is in its word window`);
  }
  const toAct = state.toActIndex;
  const acting = toAct === null ? undefined : state.seats[toAct];
  if (toAct === null || acting === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  if (acting.id !== botId) {
    throw new OfflineActionError(`${botId} is not to act at ${state.phase}; ${acting.id} is`);
  }
  const betting = state.betting;
  if (betting === null) throw new OfflineActionError(`no betting round is open at ${state.phase}`);
  const bounds = bettingBounds(state.seats, betting, toAct, state.stakes.bigBlind);
  if (bounds === null) throw new OfflineActionError(`${botId} cannot act at ${state.phase}`);
  return decideBotBet(observeBot(state, toAct, betting), bounds);
}
