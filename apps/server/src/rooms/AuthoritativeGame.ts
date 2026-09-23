import {
  OfflineActionError,
  reduce,
  startHand,
  type Dictionary,
  type OfflineState,
} from "@wordpoker/game-rules";
import type { OfflineAction } from "@wordpoker/contracts";

export interface AuthoritativeGameOptions {
  readonly seed: number;
  readonly dictionary: Dictionary;
  readonly minBet: number;
  readonly turnDurationMs: number;
}

export interface AuthoritativePlayer {
  readonly playerId: string;
  readonly stack: number;
}

/**
 * Deep adapter around the pure reducer. The room supplies time and connection membership; this
 * module owns every engine transition that can replace the authoritative hand state.
 */
export class AuthoritativeGame {
  private current: OfflineState | null = null;

  constructor(private readonly options: AuthoritativeGameOptions) {}

  get state(): OfflineState | null {
    return this.current;
  }

  start(players: readonly AuthoritativePlayer[], nowMs: number, dealerSeat = 0): void {
    this.current = startHand({
      seed: this.options.seed,
      players: players.map((player) => player.playerId),
      nowMs,
      dictionary: this.options.dictionary,
      stakes: { minBet: this.options.minBet },
      stacks: players.map((player) => ({ playerId: player.playerId, stack: player.stack })),
      dealerSeat,
      turnDurationMs: this.options.turnDurationMs,
    });
  }

  dispatch(action: OfflineAction, nowMs: number): void {
    this.current = reduce(this.requireState(), action, nowMs);
  }

  /**
   * §28/§29's removal, not §15's clock: a seat that is really gone — a clean leave, or a
   * reconnect hold that has run out — is folded out of the hand in progress when it is the
   * seat on the turn. A seat that has merely dropped is not this: it keeps its seat and runs
   * its own turn clock like a connected one, and the deadline folds it (§29, ADR 0006).
   */
  foldDepartedSeat(playerId: string, nowMs: number): void {
    const state = this.current;
    if (state === null || state.toActIndex === null) return;
    if (state.seats[state.toActIndex]?.id !== playerId) return;

    // `foldTurn` is legal at any point of the clock, so a departure cannot race the deadline.
    this.current = reduce(state, { type: "foldTurn" }, nowMs);
  }

  timeoutWords(nowMs: number): void {
    this.dispatch({ type: "timeoutWords" }, nowMs);
  }

  timeoutTurn(nowMs: number): void {
    this.dispatch({ type: "timeoutTurn" }, nowMs);
  }

  dealNext(nowMs: number): void {
    this.dispatch({ type: "deal" }, nowMs);
  }

  clear(): void {
    this.current = null;
  }

  private requireState(): OfflineState {
    if (this.current === null) {
      throw new OfflineActionError("the table has not dealt a hand");
    }
    return this.current;
  }
}
