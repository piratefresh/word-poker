import {
  OfflineActionError,
  RULES_VERSION,
  reduce,
  startHand,
  summarizeHand,
  type Dictionary,
  type OfflineState,
} from "@wordpoker/game-rules";
import {
  HAND_RECORD_VERSION,
  type HandRecord,
  type HandRecordAction,
  type HandRecordSeat,
  type OfflineAction,
  type PowerUpSettings,
  type RecordedHandAction,
} from "@wordpoker/contracts";

export interface AuthoritativeGameOptions {
  readonly seed: number;
  readonly dictionary: Dictionary;
  /** The table's blinds (§5, ADR 0004), derived from its buy-in when the room was created. */
  readonly blinds: { readonly smallBlind: number; readonly bigBlind: number };
  readonly turnDurationMs: number;
  /** §40's deal mode. The engine carries it from hand to hand once the first is dealt with it. */
  readonly powerUps: PowerUpSettings;
  /**
   * STO-455's settlement observer: called exactly once per hand that pays out, with everything
   * a hand record needs — the settled table, the table the hand was dealt from, and the accepted
   * action log. Every transition path (player actions, power commands, clock expiries, §29's
   * departures) funnels through this class, so this is the one place settlement is observed.
   */
  readonly onSettled?: (hand: SettledHand) => void;
}

export interface AuthoritativePlayer {
  readonly playerId: string;
  readonly stack: number;
}

/** Who took an accepted action, as a record logs it. Online tables have no bots. */
export type HandActionSource = "player" | "timeout" | "disconnect";

/** One accepted transition of a hand, at the clock reading the room accepted it at. */
export interface RecordedTransition {
  readonly atMs: number;
  readonly source: HandActionSource;
  readonly action: RecordedHandAction;
}

/** A hand that has paid out, with the inputs it was dealt from and the log that got it there. */
export interface SettledHand {
  /** The settled table: the reveal and the settlement (§21, §25). */
  readonly state: OfflineState;
  /** The table as the deal left it, before any action: the hand's replay inputs. */
  readonly dealt: OfflineState;
  /** When the hand was dealt, on the room's stepped clock. */
  readonly startedAtMs: number;
  /** The settling action's clock reading. */
  readonly endedAtMs: number;
  /** Every accepted action in order, the settling one included; the deal is not an action. */
  readonly log: readonly RecordedTransition[];
}

/**
 * Deep adapter around the pure reducer. The room supplies time and connection membership; this
 * module owns every engine transition that can replace the authoritative hand state, and —
 * because it is that single seam — the accepted action log and the settlement observation too.
 */
export class AuthoritativeGame {
  private current: OfflineState | null = null;
  private log: RecordedTransition[] = [];
  private dealt: OfflineState | null = null;
  private startedAtMs = 0;
  /** Whether the hand in play has already been reported to the settlement observer. */
  private settlementReported = false;

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
      // Online, every seat is a person: nobody is left out of the draw as a bot.
      powerUps: { deal: this.options.powerUps.deal },
    });
    this.beginHand(nowMs);
  }

  dispatch(action: OfflineAction, nowMs: number, source: HandActionSource = "player"): void {
    this.current = reduce(this.requireState(), action, nowMs);

    if (action.type === "deal") {
      // The deal begins the next hand's log; it is a transition, but never a recorded action.
      this.beginHand(nowMs);
      return;
    }

    this.log.push({ atMs: nowMs, source, action: action as RecordedHandAction });
    this.observeSettlement(nowMs);
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
    this.dispatch({ type: "foldTurn" }, nowMs, "disconnect");
  }

  timeoutWords(nowMs: number): void {
    this.dispatch({ type: "timeoutWords" }, nowMs, "timeout");
  }

  timeoutPowerDraw(nowMs: number): void {
    this.dispatch({ type: "timeoutPowerDraw" }, nowMs, "timeout");
  }

  timeoutTurn(nowMs: number): void {
    this.dispatch({ type: "timeoutTurn" }, nowMs, "timeout");
  }

  dealNext(nowMs: number): void {
    this.dispatch({ type: "deal" }, nowMs);
  }

  clear(): void {
    this.current = null;
    this.log = [];
    this.dealt = null;
    this.startedAtMs = 0;
  }

  /**
   * A hand record for the settled hand, stamped with what the room knows about its seats. The
   * summary is the engine's own derivation (`summarizeHand`), never a client's claim; `userId`
   * is the verified account of the seat's binding, the one thing only the room knows.
   */
  handRecord(
    settled: SettledHand,
    identity: {
      readonly sessionId: string;
      readonly tableName?: string;
      readonly userIdFor: (playerId: string) => string | null;
    },
  ): HandRecord {
    const { dealt, state } = settled;

    return {
      version: HAND_RECORD_VERSION,
      sessionId: identity.sessionId,
      handNo: state.hand,
      mode: "online",
      ranked: true,
      startedAtMs: settled.startedAtMs,
      endedAtMs: settled.endedAtMs,
      seed: dealt.seed,
      dealerSeat: dealt.dealerSeat,
      rulesVersion: RULES_VERSION,
      dictionaryId: this.options.dictionary.id,
      dictionaryFingerprint: this.options.dictionary.source.sha256,
      config: {
        ...(identity.tableName ? { tableName: identity.tableName } : {}),
        smallBlind: this.options.blinds.smallBlind,
        bigBlind: this.options.blinds.bigBlind,
        turnDurationMs: this.options.turnDurationMs,
        autoSubmitDrafts: state.autoSubmitDrafts,
        powerUpDeal: this.options.powerUps.deal,
      },
      // `startHand` posts the blinds before it returns, so the stack a seat brought is the one
      // it holds plus what it has already committed (the same read a replay reconstructs from).
      seats: dealt.seats.map((seat, index): HandRecordSeat => {
        const userId = identity.userIdFor(seat.id);

        return {
          playerId: seat.id,
          userId,
          name: `Seat ${index + 1}`,
          initialStack: seat.stack + seat.committedHand,
        };
      }),
      actions: settled.log.map((entry, sequence): HandRecordAction => ({
        sequence,
        atMs: entry.atMs,
        source: entry.source,
        action: entry.action,
      })),
      summary: summarizeHand(state),
    };
  }

  /** A fresh deal: the log starts empty and the dealt table is the hand's replay inputs. */
  private beginHand(nowMs: number): void {
    this.log = [];
    this.dealt = this.current;
    this.startedAtMs = nowMs;
    this.settlementReported = false;
  }

  /**
   * The settlement observation: the hand that just paid out is reported once. A later no-op
   * transition at payout (a private word check, §19's quota) leaves the same settled hand, and
   * the flag says it was already reported; a fresh deal resets it.
   */
  private observeSettlement(settledAtMs: number): void {
    const state = this.current;
    if (state === null || this.dealt === null || this.settlementReported) return;
    if (state.phase !== "payout" || state.result === null) return;

    this.settlementReported = true;
    this.options.onSettled?.({
      state,
      dealt: this.dealt,
      startedAtMs: this.startedAtMs,
      endedAtMs: settledAtMs,
      log: [...this.log],
    });
  }

  private requireState(): OfflineState {
    if (this.current === null) {
      throw new OfflineActionError("the table has not dealt a hand");
    }
    return this.current;
  }
}
