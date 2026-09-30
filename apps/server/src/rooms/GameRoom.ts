import { randomInt } from "node:crypto";

import { Client, CloseCode, ErrorCode, Room, ServerError } from "colyseus";
import {
  GAME_EVENTS,
  GAME_MESSAGES,
  WAITING_PHASE,
  isGameMessagePayload,
  blindsFor,
  validateRoomCreateOptions,
  type GameRejectionEvent,
  type GameRoomMetadata,
  type GameTableConfig,
  type OfflineAction,
  type OnlineBettingAction,
  type RoomPhase,
} from "@wordpoker/contracts";
import {
  BettingRejectionError,
  OfflineActionError,
  WordRejectionError,
  OFFLINE_TURN_MS,
  loadDictionary,
  type Dictionary,
} from "@wordpoker/game-rules";

import {
  AuthoritativeGame,
  type AuthoritativePlayer,
} from "./AuthoritativeGame.js";
import {
  GameRoomProjection,
  type ProjectionBinding,
} from "./GameRoomProjection.js";
import { GameRoomState } from "./schema/GameRoomState.js";

const DEFAULT_RECONNECT_SECONDS = 180;
/**
 * How long a paid-out hand stays on the felt before the room deals again: the clients present the
 * results over it (STO-430), and a hold shorter than a read would deal the next hand, and start
 * its turn clock, behind a scoreboard nobody has finished.
 */
const DEFAULT_PAYOUT_DELAY_MS = 8_000;
const HOLD_RECHECK_MS = 1_000;
/** The fewest seats a hand is dealt to: a table of one is a waiting room, not a game. */
const MIN_PLAYERS = 2;

type TableConfig = GameTableConfig;

interface SeatBinding {
  readonly playerId: string;
  readonly seat: number;
  client: Client;
  connected: boolean;
  present: boolean;
  tableStack: number;
  /** Said ready in the waiting room. Cleared every time the table goes back to waiting. */
  ready: boolean;
}

interface RoomKnobs {
  seed?: unknown;
  payoutDelay?: unknown;
  turnDuration?: unknown;
  reconnectSeconds?: unknown;
  tickMs?: unknown;
}

/** Colyseus lifecycle coordinator for one authoritative table. */
export class GameRoom extends Room<{ state: GameRoomState; metadata: GameRoomMetadata }> {
  state = new GameRoomState();

  private dictionary!: Dictionary;
  private table!: TableConfig;
  private engine?: AuthoritativeGame;
  private readonly bindings = new Map<string, SeatBinding>();
  private readonly projection = new GameRoomProjection(this.state);
  private seed = 1;
  private turnDuration = OFFLINE_TURN_MS;
  private reconnectSeconds = DEFAULT_RECONNECT_SECONDS;
  private payoutDelay = DEFAULT_PAYOUT_DELAY_MS;
  private tickMs = 50;
  private payoutReadyAtMs: number | null = null;

  private get game() {
    return this.engine?.state ?? null;
  }

  private get authoritative(): AuthoritativeGame {
    if (this.engine === undefined) {
      throw new Error("the room has not initialized its game engine");
    }
    return this.engine;
  }

  private now(): number {
    return this.clock.currentTime;
  }

  messages = {
    [GAME_MESSAGES.betting]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.betting, payload)) return;

      const action: OfflineAction = {
        ...payload,
        playerId: client.sessionId,
      } as OnlineBettingAction & { playerId: string };
      this.apply(client, action, "betting");
    },
    [GAME_MESSAGES.checkWord]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.checkWord, payload)) return;

      this.apply(
        client,
        {
          type: "checkWord",
          playerId: client.sessionId,
          submission: payload.submission,
        },
        "checkWord",
      );
    },
    [GAME_MESSAGES.draftWord]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.draftWord, payload)) return;

      this.apply(
        client,
        {
          type: "draftWord",
          playerId: client.sessionId,
          submission: payload.submission,
        },
        "draftWord",
      );
    },
    [GAME_MESSAGES.confirmWord]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.confirmWord, payload)) return;

      this.apply(
        client,
        {
          type: "confirmWord",
          playerId: client.sessionId,
          submission: payload.submission,
        },
        "confirmWord",
      );
    },
    [GAME_MESSAGES.ready]: (client: Client, payload: unknown) => this.onReady(client, payload),
  };

  /** The one message the waiting room answers: a seat saying it is (or is no longer) ready. */
  private onReady(client: Client, payload: unknown) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined || !binding.present || !binding.connected) return;
    if (!this.isPayload(GAME_MESSAGES.ready, payload)) return;
    // Once a hand is dealt the question is settled; a late toggle changes nothing.
    if (this.game !== null) return;

    binding.ready = payload.ready;
    this.project();
    this.startWhenReady();
  }

  async onCreate(rawOptions: unknown) {
    const validation = validateRoomCreateOptions(rawOptions);
    if ("refusal" in validation) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, validation.refusal.message);
    }

    const { name, buyIn, maxSeats } = validation.options;
    this.table = { name, buyIn, ...blindsFor(buyIn), maxSeats };
    this.maxClients = maxSeats;
    this.dictionary = await loadDictionary();

    // A browser-driven smoke creates its table through the real lobby form, which cannot send a
    // seed; behind the deterministic gate the smoke runner supplies the knobs here instead, and
    // anything the create names still wins (STO-483).
    const knobs = { ...smokeRoomDefaults(), ...((rawOptions ?? {}) as RoomKnobs) };
    if (
      process.env.WORDPOKER_DETERMINISTIC_SEED === "1" &&
      typeof knobs.seed === "number" &&
      Number.isSafeInteger(knobs.seed)
    ) {
      this.seed = knobs.seed;
    } else {
      this.seed = randomSeed();
    }
    if (
      typeof knobs.payoutDelay === "number" &&
      Number.isFinite(knobs.payoutDelay) &&
      knobs.payoutDelay >= 0
    ) {
      this.payoutDelay = knobs.payoutDelay;
    }
    if (
      typeof knobs.turnDuration === "number" &&
      Number.isFinite(knobs.turnDuration) &&
      knobs.turnDuration > 0
    ) {
      this.turnDuration = knobs.turnDuration;
    }
    if (
      typeof knobs.reconnectSeconds === "number" &&
      Number.isFinite(knobs.reconnectSeconds) &&
      knobs.reconnectSeconds > 0
    ) {
      this.reconnectSeconds = knobs.reconnectSeconds;
    }
    if (typeof knobs.tickMs === "number" && Number.isFinite(knobs.tickMs) && knobs.tickMs > 0) {
      this.tickMs = knobs.tickMs;
    }

    this.engine = new AuthoritativeGame({
      seed: this.seed,
      dictionary: this.dictionary,
      blinds: { smallBlind: this.table.smallBlind, bigBlind: this.table.bigBlind },
      turnDurationMs: this.turnDuration,
    });
    this.setTimestep(() => this.onTick(), this.tickMs);
    this.project();
    this.publishPhase();
  }

  onJoin(client: Client, _options: unknown) {
    if (this.game !== null) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "the table is mid-hand; join the next hand");
    }

    const seat = firstFreeSeat(this.bindings, this.maxClients);
    if (seat === null) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "the table has no free seat");
    }

    // Seats are anonymous: any client that joins becomes a seat keyed by its `sessionId`.
    // There is no `onAuth`/identity until Epic B, so a seat is a connection.
    this.bindings.set(client.sessionId, {
      playerId: client.sessionId,
      seat,
      client,
      connected: true,
      present: true,
      tableStack: this.table.buyIn,
      ready: false,
    });
    this.project();
    this.sendPrivateStateLater(client);
  }

  onDrop(client: Client, _code: CloseCode) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined) return;

    binding.connected = false;
    this.project();
    // Keep the seat's current turn alive during the reconnect hold. If the dropped seat is still
    // to act when its deadline expires, the room's tick folds it; reconnecting before then
    // restores the same rack, draft, seat, and remaining clock.

    this.allowReconnection(client, this.reconnectSeconds).catch(() => {
      // Colyseus routes expiry to onLeave; room shutdown can reject this promise.
    });
  }

  onReconnect(client: Client) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined) return;

    binding.client = client;
    binding.connected = true;
    this.project();
    this.sendPrivateState(client);
  }

  onLeave(client: Client, _code: CloseCode) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined) return;

    binding.connected = false;
    binding.present = false;

    if (this.game === null) {
      this.bindings.delete(client.sessionId);
      this.project();
      this.publishPhase();
      // The seat that left may have been the last one the rest were waiting on.
      this.startWhenReady();
      return;
    }

    // §28/§29's removal: a seat that is really gone — a clean leave, or a reconnect hold that
    // has run out — is folded out of the hand in progress. That is not §15's clock: a seat that
    // has merely dropped keeps its place and runs its turn clock like a connected one, and the
    // deadline folds it if it is still to act when its clock runs out (§29, ADR 0006).
    this.authoritative.foldDepartedSeat(client.sessionId, this.now());
    this.project();
  }

  /**
   * The waiting room deals once every seat at the table has said ready, and there are at least
   * two of them. A dropped seat holds the deal: it is still at the table, and it has not seen it.
   */
  private startWhenReady() {
    if (this.game !== null) return;
    const present = this.presentBindings();
    if (present.length < MIN_PLAYERS) return;
    if (!present.every((binding) => binding.ready && binding.connected)) return;
    this.startFirstHand();
  }

  /** Back to the waiting room: everyone says ready again before the next deal. */
  private returnToWaiting() {
    this.authoritative.clear();
    for (const [playerId, binding] of this.bindings) {
      if (!binding.present) this.bindings.delete(playerId);
      else binding.ready = false;
    }
    this.project();
    this.publishPhase();
    this.sendPrivateStates();
  }

  private startFirstHand() {
    const players: AuthoritativePlayer[] = this.presentBindings().map((binding) => ({
      playerId: binding.playerId,
      stack: binding.tableStack,
    }));
    this.authoritative.start(players, this.now(), 0);
    this.syncStacks();
    this.project();
    this.publishPhase();
    this.sendPrivateStatesLater();
  }

  private apply(
    client: Client,
    action: OfflineAction,
    message: "betting" | "checkWord" | "draftWord" | "confirmWord",
  ) {
    if (this.game === null) {
      if (message === "checkWord") return;
      this.sendRejection(client, rejectionFor(message, "hand-over"));
      return;
    }

    try {
      this.authoritative.dispatch(action, this.now());
      this.syncStacks();
      this.project();
      this.sendPrivateStates();
    } catch (error) {
      if (error instanceof BettingRejectionError) {
        if (error.reason === "turn-timeout") {
          this.handleTurnTimeout();
          return;
        }
        this.sendRejection(client, { action: "betting", reason: error.reason });
      } else if (error instanceof WordRejectionError) {
        if (message === "checkWord") return;
        if (message === "betting") {
          this.sendRejection(client, rejectionFor(message, "hand-over"));
        } else {
          this.sendRejection(client, { action: message, reason: error.reason });
        }
      } else if (error instanceof OfflineActionError) {
        if (message === "checkWord") return;
        this.sendRejection(client, rejectionFor(message, "hand-over"));
      } else {
        throw error;
      }
    }
  }

  /** The room's one clock: every deadline is checked here, on the timestep, so nothing is armed
   * against Colyseus's timer service and a test paces the room by choosing `tickMs`. */
  private onTick(): void {
    try {
      const now = this.now();
      this.state.now = now;
      const game = this.game;
      if (game === null) return;

      if (game.phase !== "payout") this.payoutReadyAtMs = null;

      if (game.betting !== null && game.toActIndex !== null) {
        if (now >= game.endsAtMs) this.handleTurnTimeout();
        return;
      }

      if (game.wordWindow?.status === "open") {
        if (now >= game.endsAtMs) this.handleWordTimeout();
        return;
      }

      if (game.phase === "payout") {
        if (this.payoutReadyAtMs === null) this.payoutReadyAtMs = now + this.payoutDelay;
        else if (now >= this.payoutReadyAtMs) this.startNextHandOrWait();
      }
    } catch (error) {
      console.error("room tick failed", error);
    }
  }

  private handleTurnTimeout() {
    const game = this.game;
    if (game === null || game.betting === null || game.toActIndex === null) return;
    if (this.now() < game.endsAtMs) return;

    try {
      const actor = game.seats[game.toActIndex];
      if (actor === undefined) return;
      const binding = this.bindingFor(actor.id);

      // §15/ADR 0006: an expired turn folds, idle or dropped — a dropped seat runs this same
      // clock and is folded here, not when action reached it. §29's hold keeps its seat; the
      // only seat folded before its clock is one that is really gone, which onLeave folds.
      this.authoritative.timeoutTurn(this.now());
      this.syncStacks();
      this.project();
      this.sendPrivateStates();

      // A connected seat is told its turn expired. A dropped one has no client left to tell,
      // and must not receive an event after it disconnected (ADR 0003).
      if (binding?.connected === true) {
        this.sendRejection(binding.client, { action: "betting", reason: "turn-timeout" });
      }
    } catch (error) {
      console.error("turn timeout failed", error);
    }
  }

  private handleWordTimeout(): void {
    if (this.game?.wordWindow?.status !== "open") return;
    try {
      this.authoritative.timeoutWords(this.now());
      this.syncStacks();
      this.project();
      this.sendPrivateStates();
    } catch (error) {
      console.error("word timeout failed", error);
    }
  }

  private startNextHandOrWait(): void {
    const game = this.game;
    if (game === null || game.phase !== "payout") return;
    this.syncStacks();
    const present = this.presentBindings();
    // A seat that left takes the table back to the waiting room; the rest play on only once they
    // all say ready again, so nobody is dealt into a smaller game they did not agree to.
    if (present.length !== game.seats.length) {
      this.returnToWaiting();
      return;
    }
    if (!present.every((binding) => binding.connected)) {
      // §29's hold spans the gap between hands too: a dropped seat keeps its seat and stack, so
      // the table waits for it to come back or for its hold to expire (onLeave then takes the
      // under-full path above) instead of dealing hands it will only fold away.
      this.payoutReadyAtMs = this.now() + HOLD_RECHECK_MS;
      return;
    }
    this.authoritative.dealNext(this.now());
    if (this.game?.sessionOver === true) {
      // §27/§28: a busted seat re-buys or leaves between hands, and the wallet is Epic B's — so
      // the room holds each seat's ended stack and waits rather than dealing a hand nobody can pay.
      this.returnToWaiting();
      return;
    }
    this.syncStacks();
    this.project();
    this.publishPhase();
    this.sendPrivateStates();
  }

  private syncStacks() {
    const game = this.game;
    if (game === null) return;

    for (const seat of game.seats) {
      const binding = this.bindingFor(seat.id);
      if (binding !== undefined) binding.tableStack = seat.stack;
    }
  }

  private project() {
    this.projection.project({
      table: this.table,
      game: this.game,
      bindings: this.projectionBindings(),
      now: this.now(),
    });
    this.publishPhase();
  }

  private sendPrivateStates() {
    for (const binding of this.presentBindings()) {
      if (binding.connected) this.sendPrivateState(binding.client);
    }
  }

  private sendPrivateStateLater(client: Client) {
    this.clock.setTimeout(() => {
      const binding = this.bindings.get(client.sessionId);
      if (binding?.connected === true) this.sendPrivateState(binding.client);
    }, 0);
  }

  private sendPrivateStatesLater() {
    this.clock.setTimeout(() => this.sendPrivateStates(), 0);
  }

  private sendPrivateState(client: Client) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined) return;

    client.send(
      GAME_EVENTS.privateState,
      this.projection.privateState({
        game: this.game,
        binding,
        now: this.now(),
      }),
    );
  }

  private sendRejection(client: Client, event: GameRejectionEvent) {
    client.send(GAME_EVENTS.rejected, event);
  }

  private publishPhase() {
    if (this.table === undefined) return;
    const status: RoomPhase = this.game?.phase ?? WAITING_PHASE;
    const metadata: GameRoomMetadata = { ...this.table, status };
    this.setMatchmaking({ metadata }).catch(() => {
      // A listing failure must not mutate the hand or reject an action.
    });
  }

  private isAtTable(client: Client): boolean {
    const binding = this.bindings.get(client.sessionId);
    return binding !== undefined && binding.present && binding.connected;
  }

  private isPayload<Name extends keyof typeof GAME_MESSAGES>(name: Name, value: unknown) {
    return isGameMessagePayload(GAME_MESSAGES[name], value);
  }

  private bindingFor(playerId: string) {
    return this.bindings.get(playerId);
  }

  private projectionBindings(): ProjectionBinding[] {
    return this.orderedBindings().map((binding) => ({
      playerId: binding.playerId,
      seat: binding.seat,
      connected: binding.connected,
      tableStack: binding.tableStack,
      ready: binding.ready,
    }));
  }

  private presentBindings(): SeatBinding[] {
    return this.orderedBindings().filter((binding) => binding.present);
  }

  private orderedBindings(): SeatBinding[] {
    return [...this.bindings.values()].sort((a, b) => a.seat - b.seat);
  }
}

function firstFreeSeat(bindings: ReadonlyMap<string, SeatBinding>, maxSeats: number): number | null {
  const occupied = new Set(
    [...bindings.values()]
      .filter((binding) => binding.present)
      .map((binding) => binding.seat),
  );
  for (let seat = 0; seat < maxSeats; seat += 1) {
    if (!occupied.has(seat)) return seat;
  }
  return null;
}

/**
 * The smoke runner's room knobs, as JSON in `WORDPOKER_SMOKE_ROOM`. Read only behind the
 * deterministic gate: without it a room never takes knobs from the environment.
 */
function smokeRoomDefaults(): RoomKnobs {
  const raw = process.env.WORDPOKER_SMOKE_ROOM;
  if (process.env.WORDPOKER_DETERMINISTIC_SEED !== "1" || !raw) return {};
  const parsed: unknown = JSON.parse(raw);
  return parsed !== null && typeof parsed === "object" ? (parsed as RoomKnobs) : {};
}

/** A seed nobody can read off the wire: the room id is public, so it must never derive the deal. */
function randomSeed(): number {
  return randomInt(0, 0x1_0000_0000);
}

function rejectionFor(
  message: "betting" | "draftWord" | "confirmWord",
  reason: "hand-over",
): GameRejectionEvent {
  if (message === "betting") return { action: "betting", reason };
  return { action: message, reason: "timer-expired" };
}
