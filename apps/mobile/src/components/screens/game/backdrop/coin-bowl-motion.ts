import { createContext, useContext, useEffect, useRef } from "react";
import { useReducedMotion } from "react-native-reanimated";

import type { GameScreenState } from "../game-types";

export type BowlShake = "small" | "big";
export const CoinBowlGameContext = createContext<GameScreenState | null>(null);

export function confirmedBowlShake(previous: GameScreenState, next: GameScreenState): BowlShake | null {
  if (previous.handId !== next.handId || previous.id === next.id) return null;
  const committed = next.players.filter((seat) => {
    const old = previous.players.find((player) => player?.id === seat?.id);
    return seat && old && seat.stack < old.stack;
  });
  if (committed.some((seat) => seat?.stack === 0)) return "big";
  if (previous.phase !== next.phase || committed.length === 0) return null;
  const oldBet = Math.max(0, ...previous.players.map((seat) => seat?.bet ?? 0));
  return oldBet > 0 && committed.some((seat) => (seat?.bet ?? 0) > oldBet) ? "small" : null;
}

/** Only advance the baseline on an authoritative turn, ignoring optimistic wager renders. */
export function useCoinBowlShake(play: (shake: BowlShake) => void) {
  const game = useContext(CoinBowlGameContext);
  const previous = useRef(game);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!game || previous.current?.id === game.id) return;
    const shake = previous.current ? confirmedBowlShake(previous.current, game) : null;
    previous.current = game;
    if (shake && !reducedMotion) play(shake);
  }, [game, play, reducedMotion]);
}
