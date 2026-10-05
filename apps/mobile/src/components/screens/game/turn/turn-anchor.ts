/**
 * turn-anchor.ts — the seam between the hand's state and the in-hand HUD.
 *
 * The screen owns game state and the HUD owns view models, so the mapping between the
 * two lives here as pure functions. Two of them carry the real weight: the turn anchor,
 * which is the only value the screen has to derive rather than pass through, and the
 * spoken turn phrase, which has to name a player rather than say "you".
 */

import type { ClockSample, TurnTiming } from "@/components/hud";

import type { GameScreenState } from "../game-types";

/** Wall-clock-free monotonic reading, so a sample is immune to local clock changes. */
export function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * One fixed point on the device timeline, captured when this module loads.
 *
 * Every hand is placed on the same timeline, and nothing has to read a clock during a
 * render. The pair never goes stale: `performance.now()` is measured from page load, so
 * `monotonicNow() - atMonotonicMs` carries the whole distance from this capture to the
 * present, and `correctedNowMs` extrapolates forward from it indefinitely.
 *
 * Re-anchoring per hand would buy nothing — both readings would land on the same
 * timeline — and a capture inside render would be a clock read React is right to
 * reject, because two renders of the same hand would then disagree.
 */
export const DEVICE_CLOCK_SAMPLE: ClockSample = {
  serverNowMs: Date.now(),
  atMonotonicMs: monotonicNow(),
};

/** A turn opened from a duration, together with the key naming the value it came from. */
export interface OpenTurn {
  key: string;
  timing: TurnTiming;
}

/**
 * Identifies the state a turn was opened from. A new hand and a new budget are both new
 * turns; a re-render of the same one is not.
 */
export function turnKey(game: Pick<GameScreenState, "id" | "secondsRemaining">): string {
  return `${game.id}:${game.secondsRemaining}`;
}

/**
 * Turn the turn budget into absolute timestamps.
 *
 * `secondsRemaining` is a duration, not a deadline, so it is anchored to an instant
 * exactly once. `nowMs` is the shared clock's reading — a value, not a fresh clock read
 * — which keeps the deadline on the same timeline every countdown resolves against.
 * Callers hold the result until the key changes: deriving it during every render would
 * push the deadline forward by a frame each time, and the countdown would stand still.
 */
export function openTurn(
  game: Pick<GameScreenState, "id" | "secondsRemaining">,
  nowMs: number,
): OpenTurn {
  return {
    key: turnKey(game),
    timing: {
      startedAtMs: nowMs,
      // A spent or negative budget is not a turn: it expires at once rather than
      // counting up from the wrong end.
      endsAtMs: nowMs + Math.max(0, game.secondsRemaining) * 1000,
      pausedAtMs: null,
    },
  };
}

/**
 * A turn's countdown held or released with the table's clock. Holding pins it where it stands;
 * releasing moves the whole turn later by however long it was held, so the budget left is what
 * was left — the same thing the table's own virtual clock does to its deadline. The turn comes
 * back unchanged when it is already in the asked-for state, so a caller can compare by identity.
 */
export function holdTurn(turn: OpenTurn, held: boolean, nowMs: number): OpenTurn {
  const { pausedAtMs } = turn.timing;
  if (held && pausedAtMs === null) {
    return { ...turn, timing: { ...turn.timing, pausedAtMs: nowMs } };
  }
  if (!held && pausedAtMs !== null) {
    const shift = Math.max(0, nowMs - pausedAtMs);
    return {
      ...turn,
      timing: {
        startedAtMs: turn.timing.startedAtMs + shift,
        endsAtMs: turn.timing.endsAtMs + shift,
        pausedAtMs: null,
      },
    };
  }
  return turn;
}

/**
 * Who is being asked to act, for the countdown's announcement. Omitted when it is not
 * the hero's turn: "Your turn" would be a lie at another player's turn, and the clock's
 * label already stands on its own without a name.
 */
export function heroTurnPhrase(
  game: Pick<GameScreenState, "players">,
): string | undefined {
  const hero = game.players.find((player) => player?.isHero);
  return hero?.status === "your-turn" ? `${hero.name} to act` : undefined;
}
