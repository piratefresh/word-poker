import { Room, Client, CloseCode, Delayed, ErrorCode, ServerError } from "colyseus";
import {
  ROUND_PHASES,
  WAITING_PHASE,
  minBetFor,
  validateRoomCreateOptions,
  type GameRoomMetadata,
  type RoomPhase,
  type RoundPhase,
} from "@wordpoker/contracts";
import { GameRoomState, Player } from "./schema/GameRoomState.js";

/** How long each betting round lasts before the clock advances the table. */
const DEFAULT_ROUND_DURATION = 30_000;

/** A table's config without its live status — settled once, at create, and never again. */
type TableConfig = Omit<GameRoomMetadata, "status">;

export class GameRoom extends Room<{ state: GameRoomState; metadata: GameRoomMetadata }> {
  state = new GameRoomState();

  /** Per-room so tests can run the phases through in milliseconds. */
  private roundDuration = DEFAULT_ROUND_DURATION;
  private roundTimeout?: Delayed;

  /** What the table was created with; §2's stakes are fixed for the table's whole life. */
  private table!: TableConfig;

  /**
   * A table is created with its config: §2's fixed buy-in, §5's seat cap, a name. The options are
   * checked here with the same validator the client's form runs, so the create either makes a
   * table §2 allows or fails — and a failure throws while `create` is still in flight, which is
   * what hands the form the refusal sentence rather than an unconfigured room.
   */
  onCreate(rawOptions: unknown) {
    // `in` rather than `!validation.ok`: the server compiles with strictNullChecks off, where
    // boolean discriminants stop narrowing.
    const validation = validateRoomCreateOptions(rawOptions);
    if ("refusal" in validation) {
      throw new ServerError(ErrorCode.APPLICATION_ERROR, validation.refusal.message);
    }

    const { name, buyIn, maxSeats } = validation.options;
    this.table = { name, buyIn, minBet: minBetFor(buyIn), maxSeats };
    this.maxClients = maxSeats;

    // The same config, mirrored into synced state: a joined client renders its own table's
    // stakes without a second source (the matchmaking listing is for players who have not sat).
    this.state.name = name;
    this.state.buyIn = buyIn;
    this.state.minBet = this.table.minBet;
    this.state.maxSeats = maxSeats;

    // The round clock is a test knob, not a create option: a client that could set it could skip
    // every timer, so only a development server reads it.
    const knob = (rawOptions ?? {}) as { roundDuration?: unknown };
    if (process.env.NODE_ENV !== "production" && typeof knob.roundDuration === "number") {
      this.roundDuration = knob.roundDuration;
    }

    this.publishPhase();
  }

  onJoin(client: Client, options: unknown) {
    console.log(client.sessionId, "joined!", options);
    this.state.players.set(client.sessionId, new Player());

    // The matchmaker locks a room the moment its last seat goes (Colyseus's own client count) and
    // unlocks it when one frees, which is the listing the lobby draws §3's full tables from. This
    // room adds nothing to that, and an explicit lock would outlive the fullness that caused it.
    if (this.state.players.size === this.maxClients) {
      this.startHand();
    }
  }

  onLeave(client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
    this.state.players.delete(client.sessionId);

    // A round with an empty seat has nobody to play it, so stop counting down and wait
    // for the table to fill again rather than running the clock past a missing player.
    if (this.state.players.size < this.maxClients) {
      this.pause();
    }
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  /** Deal a fresh hand: back to the first betting round, and count from there. */
  private startHand() {
    this.state.handCount++;
    this.enterPhase(ROUND_PHASES[0]);
  }

  /** Hand the table to the next betting round, dealing a new hand once past the last. */
  private advancePhase() {
    const current = ROUND_PHASES.indexOf(this.state.phase as RoundPhase);
    const next = current + 1;
    if (next >= ROUND_PHASES.length) {
      this.startHand();
    } else {
      this.enterPhase(ROUND_PHASES[next]);
    }
  }

  /** Enter a phase and (re)arm the round clock against it. */
  private enterPhase(phase: RoundPhase) {
    this.roundTimeout?.clear();
    this.state.phase = phase;
    this.state.roundDeadline = this.clock.currentTime + this.roundDuration;
    this.roundTimeout = this.clock.setTimeout(() => this.advancePhase(), this.roundDuration);
    this.publishPhase();
  }

  /** Stop the clock and return to waiting — used when the table drops below full. */
  private pause() {
    this.roundTimeout?.clear();
    this.roundTimeout = undefined;
    this.state.phase = WAITING_PHASE;
    this.state.roundDeadline = 0;
    this.publishPhase();
  }

  /**
   * Publish the table's lobby card: its config plus the phase it is in, so a list row can read
   * §3's waiting / in-hand without joining. Colyseus replaces metadata rather than merging it, so
   * the whole object is sent every time; seat counts are absent on purpose, since the listing
   * already carries `clients` / `maxClients` and the matchmaker pushes them as seats fill.
   */
  private publishPhase() {
    const metadata: GameRoomMetadata = { ...this.table, status: this.state.phase as RoomPhase };

    // Deliberately not awaited: the listing is a mirror of the table, and a store hiccup must not
    // fail a join or stall the round clock that triggered the publish.
    this.setMatchmaking({ metadata }).catch((error: unknown) => {
      console.warn("room", this.roomId, "could not publish its metadata", error);
    });
  }

  /**
   * Called on any disconnection the client did not ask for — a network blip, a
   * suspended tab, a tunnel change. Holding the seat lets the SDK retry into the
   * same session, so the player keeps their entity and their place in the room.
   */
  onDrop(client: Client, code: CloseCode) {
    // Deliberately not awaited: the framework routes the outcome to onReconnect()
    // or onLeave() by itself. The catch is only here because the promise also
    // rejects when the room is already disposing (server shutdown), which would
    // otherwise surface as an unhandled rejection.
    this.allowReconnection(client, 30).catch(() => {});
  }

  onReconnect(client: Client) {
    console.log(client.sessionId, "reconnected!");
  }
}
