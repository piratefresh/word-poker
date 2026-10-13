import { randomInt, randomUUID } from "node:crypto";

import { Client, CloseCode, ErrorCode, Room, ServerError, definePlugins } from "colyseus";
import { UniqueSessionPlugin } from "colyseus/plugins/unique-session";
import {
  GAME_EVENTS,
  FRIEND_REQUEST_MESSAGES,
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
  type OnlinePickPowerAction,
  type OnlineUsePowerUpAction,
  type PowerUsedEvent,
  type PrivatePowerDraw,
  type PrivatePowerSwap,
  type RoomPhase,
} from "@wordpoker/contracts";
import {
  BettingRejectionError,
  OfflineActionError,
  PowerRejectionError,
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
  privatePowerSwap,
  type ProjectionBinding,
} from "./GameRoomProjection.js";
import { GameRoomState } from "./schema/GameRoomState.js";
import { HistoryService } from "../history/history-service.js";
import { SettlementRecorder } from "../history/settlement-recorder.js";
import { onlineAccount, type OnlineAccount } from "../auth/online-account.js";
import { requestFriend } from "@wordpoker/db";
import { serverOrm } from "../database.js";

const DEFAULT_RECONNECT_SECONDS = 180;
/** The fewest seats a hand is dealt to: a table of one is a waiting room, not a game. */
const MIN_PLAYERS = 2;
const SEAT_GONE_MESSAGE = "That player has left the table.";

type TableConfig = GameTableConfig;

interface SeatBinding {
  readonly playerId: string;
  /** Better Auth account identity; kept server-side and stable during reconnect holds. */
  readonly userId: string;
  readonly seat: number;
  client: Client;
  connected: boolean;
  present: boolean;
  tableStack: number;
  /** Said ready in the waiting room. Cleared every time the table goes back to waiting. */
  ready: boolean;
  /** Put away the paid-out hand's results. Cleared whenever the table is off its payout. */
  seenResults: boolean;
}

/**
 * What a power command answered the first time, so a retry with the same `actionId` is answered
 * the same way instead of being judged again: a second charge, a second roll, or a refusal of a
 * use that already landed would all be wrong.
 */
type PowerOutcome =
  | { readonly kind: "picked" }
  | { readonly kind: "swapped"; readonly swap: PrivatePowerSwap }
  | { readonly kind: "refused"; readonly event: GameRejectionEvent };

interface PowerLedgerEntry {
  readonly hand: number;
  readonly outcome: PowerOutcome;
}

interface RoomKnobs {
  seed?: unknown;
  turnDuration?: unknown;
  reconnectSeconds?: unknown;
  tickMs?: unknown;
  powerUps?: unknown;
}

/** Colyseus lifecycle coordinator for one authoritative table. */
export class GameRoom extends Room<{ state: GameRoomState; metadata: GameRoomMetadata }> {
  state = new GameRoomState();

  /** One table per account: the plugin reads `auth.userId` from `onAuth` and rejects with 4400. */
  plugins = definePlugins({ unique: new UniqueSessionPlugin({ max: 1 }) });

  // `id` is the key Colyseus's session tracker indexes (the plugin reads it back from the same index).
  static override async onAuth(token: string): Promise<OnlineAccount & { readonly id: string; readonly token: string }> {
    const account = await onlineAccount(token);
    return { ...account, id: account.userId, token };
  }

  private dictionary!: Dictionary;
  private table!: TableConfig;
  private engine?: AuthoritativeGame;
  private readonly bindings = new Map<string, SeatBinding>();
  /** Sessions with a befriend request in flight; overlapping ones are dropped. */
  private readonly befriending = new Set<string>();
  private readonly projection = new GameRoomProjection(this.state);
  private seed = 1;
  private turnDuration = OFFLINE_TURN_MS;
  private reconnectSeconds = DEFAULT_RECONNECT_SECONDS;
  private tickMs = 50;
  /** Keep the settled engine hand for the next deal while projecting the ready screen. */
  private awaitingReady = false;
  /** Power commands already answered, by `${playerId}:${actionId}`. Pruned as hands go by. */
  private readonly powerLedger = new Map<string, PowerLedgerEntry>();
  /** The history session for the engine's current hand sequence (STO-453). */
  private sessionId = randomUUID();
  /** STO-455: holds every settlement until it is durable, and gates the room's advancement. */
  private settlements!: SettlementRecorder;

  private get game() {
    return this.awaitingReady ? null : this.engine?.state ?? null;
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
    [GAME_MESSAGES.befriend]: async (client: Client, payload: unknown) => {
      if (!isGameMessagePayload("befriend", payload) || !this.isAtTable(client)) return;
      if (this.game !== null) return;
      const sender = this.bindings.get(client.sessionId);
      const target = this.bindings.get(payload.playerId);
      if (!sender || sender === target || this.befriending.has(client.sessionId)) return;
      const reply = (message: string) =>
        client.send(GAME_EVENTS.befriendResult, { playerId: payload.playerId, message });
      if (!target?.present) return reply(SEAT_GONE_MESSAGE);
      this.befriending.add(client.sessionId);
      let message = "Friends aren't available right now. Try again.";
      try {
        // Persistent account changes require a current session, even on a surviving socket.
        const account = await onlineAccount(client.auth?.token);
        if (account.userId !== sender.userId) throw new Error("The seat's account no longer matches its session");
        const orm = await serverOrm();
        if (this.game !== null || !this.isAtTable(client)) return;
        if (!target.present) message = SEAT_GONE_MESSAGE;
        else if (orm) message = FRIEND_REQUEST_MESSAGES[await requestFriend(sender.userId, target.userId, { orm })];
      } catch {
        // A service outage must not interrupt the hand or expose account details.
      } finally {
        this.befriending.delete(client.sessionId);
      }
      reply(message);
    },
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
    [GAME_MESSAGES.resultsSeen]: (client: Client) => {
      const binding = this.bindings.get(client.sessionId);
      if (binding === undefined || !binding.present || !binding.connected || this.game?.phase !== "payout") return;
      binding.seenResults = true;
      this.project();
    },
    [GAME_MESSAGES.pickPower]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.pickPower, payload)) return;
      this.powerCommand(client, "pickPower", payload);
    },
    [GAME_MESSAGES.usePowerUp]: (client: Client, payload: unknown) => {
      if (!this.isAtTable(client) || !this.isPayload(GAME_MESSAGES.usePowerUp, payload)) return;
      this.powerCommand(client, "usePowerUp", payload);
    },
  };

  /** The one message the waiting room answers: a seat saying it is (or is no longer) ready. */
  private onReady(client: Client, payload: unknown) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined || !binding.present || !binding.connected) return;
    if (!this.isPayload(GAME_MESSAGES.ready, payload)) return;
    // Once a hand is dealt the question is settled; a late toggle changes nothing.
    if (this.game !== null && !(this.game.phase === "payout" && binding.seenResults)) return;

    binding.ready = payload.ready;
    this.project();
    this.startWhenReady();
  }

  async onCreate(rawOptions: unknown) {
    // A browser-driven smoke creates its table through the real lobby form, which cannot send a
    // seed; behind the deterministic gate the smoke runner supplies the knobs here instead, and
    // anything the create names still wins (STO-483). The power-up setting is the one table
    // option the env may supply, and it goes through the same validator as the create's own.
    const smoke = smokeRoomDefaults();
    const named = (rawOptions ?? {}) as RoomKnobs;
    const validation = validateRoomCreateOptions(
      named.powerUps === undefined && smoke.powerUps !== undefined
        ? { ...named, powerUps: smoke.powerUps }
        : rawOptions,
    );
    if ("refusal" in validation) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, validation.refusal.message);
    }

    const { name, buyIn, maxSeats, powerUps } = validation.options;
    this.table = { name, buyIn, ...blindsFor(buyIn), maxSeats, powerUps };
    this.maxClients = maxSeats;
    this.dictionary = await loadDictionary();

    const knobs = { ...smoke, ...named };
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

    const history = await HistoryService.fromEnv();
    if (history === null) {
      console.log("history: WORDPOKER_DATABASE_URL is not set; hands at this table are not recorded");
    }
    this.settlements = new SettlementRecorder({
      build: (settled) =>
        engine.handRecord(settled, {
          sessionId: this.sessionId,
          tableName: this.table.name,
          userIdFor: (playerId) => this.bindings.get(playerId)?.userId ?? null,
        }),
      write: history,
      now: () => this.now(),
      log: (message, error) => console.error(message, error),
    });

    const engine = new AuthoritativeGame({
      seed: this.seed,
      dictionary: this.dictionary,
      blinds: { smallBlind: this.table.smallBlind, bigBlind: this.table.bigBlind },
      turnDurationMs: this.turnDuration,
      powerUps: this.table.powerUps,
      onSettled: (hand) => this.settlements.observe(hand),
    });
    this.engine = engine;
    this.setTimestep(() => this.onTick(), this.tickMs);
    this.project();
    this.publishPhase();
  }

  onJoin(client: Client, _options: unknown, auth: OnlineAccount) {
    if (this.game !== null) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "the table is mid-hand; join the next hand");
    }

    const seat = firstFreeSeat(this.bindings, this.maxClients);
    if (seat === null) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, "the table has no free seat");
    }

    // A changed lineup starts from the held stacks, rather than the previous hand's seats. The
    // settled hand is already durable when finishResults exposes the waiting room.
    if (this.awaitingReady) {
      this.authoritative.clear();
      this.awaitingReady = false;
    }

    // Engine actions keep using the connection id; history uses the verified account id.
    this.bindings.set(client.sessionId, {
      playerId: client.sessionId,
      userId: auth.userId,
      seat,
      client,
      connected: true,
      present: true,
      tableStack: this.table.buyIn,
      ready: false,
      seenResults: false,
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
    this.startWhenReady();
  }

  onLeave(client: Client, _code: CloseCode) {
    const binding = this.bindings.get(client.sessionId);
    if (binding === undefined) return;

    binding.connected = false;
    binding.present = false;

    if (this.game === null) {
      // Waiting is exposed only after persistence, so no async gap can race another join/deal.
      this.authoritative.clear();
      this.awaitingReady = false;
      this.bindings.delete(client.sessionId);
      this.project();
      this.publishPhase();
      // The seat that left may have been the last one the rest were waiting on.
      this.startWhenReady();
      this.closeIfEmpty();
      return;
    }

    // §28/§29's removal: a seat that is really gone — a clean leave, or a reconnect hold that
    // has run out — is folded out of the hand in progress. That is not §15's clock: a seat that
    // has merely dropped keeps its place and runs its turn clock like a connected one, and the
    // deadline folds it if it is still to act when its clock runs out (§29, ADR 0006).
    this.authoritative.foldDepartedSeat(client.sessionId, this.now());
    this.project();
    this.closeIfEmpty();
  }

  /** Nobody left at the table (reconnect holds included): close the room instead of idling. */
  private closeIfEmpty() {
    if (this.presentBindings().length === 0) void this.drainAndDisconnect();
  }

  /**
   * STO-455's last hold: a room with nobody in it still does not go away until its settlements
   * are durable. Seats may rejoin while the drain runs, so emptiness is asked again after it.
   */
  private async drainAndDisconnect(): Promise<void> {
    await this.settlements.idle();
    if (this.presentBindings().length === 0) await this.disconnect();
  }

  /** Shutdown bounds the DB drain; the next process recovers journaled records. */
  override onDispose(): Promise<void> {
    const giveUp = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      timer.unref?.();
    });
    return Promise.race([this.settlements?.idle() ?? Promise.resolve(), giveUp]);
  }

  /**
   * The waiting room deals once every seat at the table has said ready, and there are at least
   * two of them. A dropped seat holds the deal: it is still at the table, and it has not seen it.
   */
  private startWhenReady() {
    if (this.game !== null) return;
    // A hand whose record is still undurable is not done with: the deal waits (STO-455).
    if (this.settlements.pending) return;
    const present = this.presentBindings();
    if (present.length < MIN_PLAYERS) return;
    if (!present.every((binding) => binding.ready && binding.connected)) return;
    this.startHand();
  }

  /** Back to the waiting room: everyone says ready again before the next deal. */
  private returnToWaiting(preserveHand = false) {
    if (!preserveHand) this.authoritative.clear();
    this.awaitingReady = preserveHand;
    this.powerLedger.clear();
    for (const [playerId, binding] of this.bindings) {
      if (!binding.present) this.bindings.delete(playerId);
      else {
        if (!preserveHand) binding.ready = false;
        binding.seenResults = false;
      }
    }
    this.project();
    this.publishPhase();
    this.sendPrivateStates();
  }

  private startHand() {
    const players: AuthoritativePlayer[] = this.presentBindings().map((binding) => ({
      playerId: binding.playerId,
      stack: binding.tableStack,
    }));
    if (this.awaitingReady) {
      this.awaitingReady = false;
      this.authoritative.dealNext(this.now());
      if (this.game?.sessionOver === true) {
        this.returnToWaiting();
        return;
      }
    } else {
      this.sessionId = randomUUID();
      this.authoritative.start(players, this.now(), 0);
    }
    for (const binding of this.bindings.values()) {
      binding.ready = false;
      binding.seenResults = false;
    }
    this.syncStacks();
    this.project();
    this.publishPhase();
    this.sendPrivateStatesLater();
    this.prunePowerLedger();
    this.clock.setTimeout(() => this.sendPowerDraws(), 0);
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
      // Never write synced state here unconditionally: every write is a patch, and a patch every
      // tick re-renders every client's felt 20×/s. `state.now` moves with `project()` instead.
      const now = this.now();
      // STO-455: a failed history write is retried here, off the interactive action path, while
      // the holds below keep the room from advancing past the undurable settlement.
      this.settlements.tick();
      const game = this.game;
      if (game === null) return;
      // §44: nobody is on the clock while the Power Draw is open; its own clock is the deadline.
      const draw = game.powers?.draw;
      if (draw?.status === "open") {
        if (now >= draw.endsAtMs) this.handlePowerDrawTimeout();
        return;
      }

      if (game.betting !== null && game.toActIndex !== null) {
        if (now >= game.endsAtMs) this.handleTurnTimeout();
        return;
      }

      if (game.wordWindow?.status === "open") {
        if (now >= game.endsAtMs) this.handleWordTimeout();
        return;
      }

      if (game.phase === "payout" && this.presentBindings().every((binding) => binding.seenResults)) {
        this.finishResults();
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

  private finishResults(): void {
    const game = this.game;
    if (game === null || game.phase !== "payout") return;
    // The paid-out hand is not finished with the table until its record is durable: every seat
    // has seen the results, but the tick keeps asking until history has them (STO-455).
    if (this.settlements.pending) return;
    this.syncStacks();
    const present = this.presentBindings();
    // A seat that left takes the table back to the waiting room; the rest play on only once they
    // all say ready again, so nobody is dealt into a smaller game they did not agree to.
    if (present.length !== game.seats.length) {
      this.returnToWaiting();
      return;
    }
    this.returnToWaiting(true);
    this.startWhenReady();
  }

  /**
   * §44's Power Draw, as each drawing seat is told it: its own offers and the room's deadline,
   * to it alone. A seat that is not connected learns its draw from its private state on return.
   */
  private sendPowerDraws() {
    const game = this.game;
    const draw = game?.powers?.draw;
    if (game == null || draw?.status !== "open") return;

    for (const slot of draw.slots) {
      const binding = this.bindingFor(slot.playerId);
      if (binding?.connected !== true) continue;
      const event: PrivatePowerDraw = {
        handId: game.hand,
        offers: [...slot.offers],
        now: this.now(),
        deadline: draw.endsAtMs,
      };
      binding.client.send(GAME_EVENTS.powerDraw, event);
    }
  }

  /** A retry is only ever for this hand or the one just before it; older answers are dropped. */
  private prunePowerLedger() {
    const hand = this.game?.hand ?? 0;
    for (const [key, entry] of this.powerLedger) {
      if (entry.hand < hand - 1) this.powerLedger.delete(key);
    }
  }

  /**
   * A power command (§44): answered from the ledger when its `actionId` has been seen, else run
   * through the engine and recorded. The engine is the judge; the room only names the hand.
   */
  private powerCommand(
    client: Client,
    message: "pickPower" | "usePowerUp",
    payload: OnlinePickPowerAction | OnlineUsePowerUpAction,
  ) {
    const key = `${client.sessionId}:${payload.actionId}`;
    const earlier = this.powerLedger.get(key);
    if (earlier !== undefined) {
      this.answerPower(client, earlier.outcome);
      return;
    }

    const hand = this.game?.hand ?? 0;
    const outcome = this.runPower(client, message, payload);
    this.powerLedger.set(key, { hand, outcome });
    // A pick that landed has already sent every seat its private state; nothing more to say.
    if (outcome.kind !== "picked") this.answerPower(client, outcome);
  }

  private runPower(
    client: Client,
    message: "pickPower" | "usePowerUp",
    payload: OnlinePickPowerAction | OnlineUsePowerUpAction,
  ): PowerOutcome {
    const refuse = (reason: PowerRejectionError["reason"]): PowerOutcome => ({
      kind: "refused",
      event: { action: message, reason, actionId: payload.actionId },
    });
    const game = this.game;
    // A command meant for another hand never lands on this one (§44: a power lasts one hand).
    if (game === null || payload.handId !== game.hand) {
      return refuse(message === "pickPower" ? "draw-closed" : "outside-window");
    }

    const playerId = client.sessionId;
    const street = game.phase;
    const action: OfflineAction =
      message === "pickPower"
        ? { type: "pickPower", playerId, powerUpId: payload.powerUpId }
        : {
            type: "usePowerUp",
            playerId,
            powerUpId: payload.powerUpId,
            tileId: (payload as OnlineUsePowerUpAction).tileId,
          };

    try {
      this.authoritative.dispatch(action, this.now());
    } catch (error) {
      if (error instanceof PowerRejectionError) return refuse(error.reason);
      if (error instanceof OfflineActionError) return refuse("outside-window");
      throw error;
    }

    this.project();
    this.sendPrivateStates();
    if (message === "pickPower") return { kind: "picked" };

    const after = this.game;
    const swap = after === null ? null : privatePowerSwap(after, playerId);
    const binding = this.bindingFor(playerId);
    if (swap === null || binding === undefined || street === "payout") {
      throw new Error("a power use landed without a swap to report");
    }
    // The public side (§44): who used which power, on which street — never what it gave.
    const used: PowerUsedEvent = { handId: swap.handId, seat: binding.seat, powerUpId: swap.powerUpId, street };
    this.broadcast(GAME_EVENTS.powerUsed, used);
    return { kind: "swapped", swap };
  }

  /** The sender's own answer: its swap, its refusal, or — for a pick — its fresh private state. */
  private answerPower(client: Client, outcome: PowerOutcome) {
    if (outcome.kind === "swapped") client.send(GAME_EVENTS.powerSwap, outcome.swap);
    else if (outcome.kind === "refused") this.sendRejection(client, outcome.event);
    else this.sendPrivateState(client);
  }

  private handlePowerDrawTimeout(): void {
    if (this.game?.powers?.draw.status !== "open") return;
    try {
      this.authoritative.timeoutPowerDraw(this.now());
      this.project();
      this.sendPrivateStates();
    } catch (error) {
      console.error("power draw timeout failed", error);
    }
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
      seenResults: binding.seenResults,
      present: binding.present,
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
