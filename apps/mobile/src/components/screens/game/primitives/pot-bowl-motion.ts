import { useContext, useEffect, useRef } from "react";
import { useReducedMotion } from "react-native-reanimated";

import { CoinBowlGameContext } from "../backdrop/coin-bowl-motion";
import type { GameScreenState } from "../game-types";
import { tableSeating } from "../seat-metrics";

/** The pot stacks' view model, as `word-poker-chip-stacking-assets/README.md` documents it. */
export interface PotBowlDriver {
  number(name: "seat" | "chipType" | "fillLevel" | "winnerSeat" | `chip${number}`, value: number): void;
  boolean(name: "reduceMotion", value: boolean): void;
  fire(name: "deposit" | "allIn" | "payout" | "reset"): void;
}

export type PotBowlCue =
  | { kind: "reset"; fillLevel: number }
  | { kind: "deposit" | "allIn"; seat: number; chipType: number; fillLevel: number }
  | { kind: "payout"; winnerSeat: number };

/** The bowl's six directions, 0 bottom then clockwise, nearest to the seat's angle on the table. */
export function bowlDirection(seatIndex: number, seatCount: number): number {
  const angles = tableSeating(seatCount, true).layoutConfig.seatAngles ?? [];
  const angle = angles[seatIndex] ?? Math.PI / 2;
  const turn = (((angle - Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(turn / (Math.PI / 3)) % 6;
}

/** `manifest.json`'s chip colours: red, blue, green, purple, gold. */
export function chipType(amount: number): number {
  return amount >= 1000 ? 4 : amount >= 500 ? 3 : amount >= 100 ? 2 : amount >= 50 ? 1 : 0;
}

/** Ten pile slots: one per two big blinds in the middle. */
export function fillLevel(game: GameScreenState): number {
  if (game.pot <= 0) return 0;
  return Math.min(10, Math.ceil(game.pot / (2 * Math.max(1, game.blinds.bigBlind))));
}

/** What one authoritative turn does to the bowl; optimistic renders (same `id`) do nothing. */
export function potBowlCue(previous: GameScreenState, next: GameScreenState): PotBowlCue | null {
  if (previous.id === next.id) return null;
  if (previous.handId !== next.handId) return { kind: "reset", fillLevel: fillLevel(next) };
  const winner = next.players.findIndex((seat, index) =>
    seat?.status === "winner" && previous.players[index]?.status !== "winner");
  if (winner !== -1) return { kind: "payout", winnerSeat: bowlDirection(winner, next.seatCount) };
  let biggest = -1;
  let paid = 0;
  next.players.forEach((seat, index) => {
    const old = previous.players.find((player) => player?.id === seat?.id);
    const spent = seat && old ? old.stack - seat.stack : 0;
    if (spent > paid) { paid = spent; biggest = index; }
  });
  if (biggest === -1) return null;
  return {
    kind: next.players[biggest]?.stack === 0 ? "allIn" : "deposit",
    seat: bowlDirection(biggest, next.seatCount),
    chipType: chipType(paid),
    fillLevel: fillLevel(next),
  };
}

/** Plays each authoritative turn on the bowl the platform view hands over once it has loaded. */
export function usePotBowl(driver: PotBowlDriver | null) {
  const game = useContext(CoinBowlGameContext);
  const previous = useRef<GameScreenState | null>(null);
  const filled = useRef(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!driver) return;
    driver.boolean("reduceMotion", reducedMotion);
  }, [driver, reducedMotion]);

  useEffect(() => {
    if (!driver || !game) return;
    const cue = previous.current
      ? potBowlCue(previous.current, game)
      : { kind: "reset" as const, fillLevel: fillLevel(game) };
    previous.current = game;
    if (!cue) return;
    if (cue.kind === "payout") {
      driver.number("winnerSeat", cue.winnerSeat);
      driver.fire("payout");
      return;
    }
    // Each slot keeps the colour of the bet that filled it; a slot drops in as `fillLevel` passes it.
    const fill = (from: number, type: number) => {
      for (let slot = from; slot < cue.fillLevel; slot++) driver.number(`chip${slot}`, type);
      driver.number("fillLevel", cue.fillLevel);
      filled.current = cue.fillLevel;
    };
    if (cue.kind === "reset") {
      fill(0, chipType(game.pot / Math.max(1, cue.fillLevel)));
      driver.fire("reset");
      return;
    }
    driver.number("seat", cue.seat);
    driver.number("chipType", cue.chipType);
    driver.fire(cue.kind);
    fill(filled.current, cue.chipType);
  }, [driver, game]);
}
