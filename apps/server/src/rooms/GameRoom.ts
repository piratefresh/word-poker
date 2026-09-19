import { Room, Client, CloseCode, Delayed } from "colyseus";
import { ROUND_PHASES, WAITING_PHASE, type RoundPhase } from "@wordpoker/contracts";
import { GameRoomState, Player } from "./schema/GameRoomState.js";

/** How long each betting round lasts before the clock advances the table. */
const DEFAULT_ROUND_DURATION = 30_000;

export class GameRoom extends Room<{ state: GameRoomState }> {
  maxClients = 2;
  state = new GameRoomState();

  /** Per-room so tests can run the phases through in milliseconds. */
  private roundDuration = DEFAULT_ROUND_DURATION;
  private roundTimeout?: Delayed;

  onCreate(options: any) {
    if (typeof options?.roundDuration === "number") {
      this.roundDuration = options.roundDuration;
    }
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    this.state.players.set(client.sessionId, new Player());

    if (this.state.players.size === this.maxClients) {
      this.lock(); // full: stop the matchmaker from sending anyone else
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
  }

  /** Stop the clock and return to waiting — used when the table drops below full. */
  private pause() {
    this.roundTimeout?.clear();
    this.roundTimeout = undefined;
    this.state.phase = WAITING_PHASE;
    this.state.roundDeadline = 0;
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
