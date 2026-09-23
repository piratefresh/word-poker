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
  /** The table's blinds (§5, ADR 0004), derived from its buy-in when the room was created. */
  readonly blinds: { readonly smallBlind: number; readonly bigBlind: number };
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
      stakes: { smallBlind: this.options.blinds.smallBlind, bigBlind: this.options.blinds.bigBlind },
      stacks: players.map((player) => ({ playerId: player.playerId, stack: player.stack })),
      dealerSeat,
      turnDurationMs: this.options.turnDurationMs,
    });
  }

  dispatch(action: OfflineAction, nowMs: number): void {
    this.current = reduce(this.requireState(), action, nowMs);
  }

  foldDisconnectedTurns(livePlayerIds: ReadonlySet<string>, nowMs: number): void {
    while (this.current !== null && this.current.toActIndex !== null) {
      const actor = this.current.seats[this.current.toActIndex];
      if (actor === undefined || livePlayerIds.has(actor.id)) return;
      this.current = reduce(this.current, { type: "foldTurn" }, nowMs);
    }
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
