import { useState } from "react";

import { useTurnClock, useTurnTimer } from "@/components/hud";

import type { GameScreenState } from "../game-types";
import { holdTurn, openTurn, turnKey } from "./turn-anchor";

/**
 * The hand's turn as the HUD counts it down, opened from the state's budget and held with the
 * table's clock. Must sit inside a `TurnClockProvider`.
 */
export function useHandTurn(
  game: Pick<GameScreenState, "id" | "secondsRemaining" | "turnEndsAtMs">,
  clockHeld: boolean,
) {
  // The shared clock's reading, not a fresh clock read: a deadline derived from a new
  // sample during render would land on a slightly different timeline than the one the
  // countdown resolves against.
  const { nowMs } = useTurnClock();

  // `game.secondsRemaining` is a budget, not a deadline, so the turn is opened once per
  // value and held. Adjusting state during the render that sees a new value is what makes
  // that hold exact — a deadline derived during every render would move forward with each
  // render and the countdown would never move at all.
  //
  // A held clock (the tutorial's, while the coach explains) pins the countdown, and releasing it
  // moves the turn later by the time it was held — the table's own clock does the same.
  const [turn, setTurn] = useState(() => holdTurn(openTurn(game, nowMs), clockHeld, nowMs));
  const nextTurn = holdTurn(turn.key !== turnKey(game) ? openTurn(game, nowMs) : turn, clockHeld, nowMs);
  if (nextTurn !== turn) setTurn(nextTurn);
  return useTurnTimer(turn.timing);
}
