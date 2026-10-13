import assert from "assert";
import { createServer } from "node:http";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import {
  GAME_EVENTS,
  GAME_MESSAGES,
  WAITING_PHASE,
  type GameRejectionEvent,
  type OnlineBettingAction,
  type PowerUsedEvent,
  type PrivatePowerDraw,
  type PrivatePowerSwap,
  type PrivateSeatState,
  type Tile,
} from "@wordpoker/contracts";
import {
  chooseOfflineWord,
  drawOffers,
  loadDictionary,
  type OfflineState,
} from "@wordpoker/game-rules";

import {
  FOUR_SEAT_BUY_IN,
  FOUR_SEAT_ROOM,
  FOUR_SEAT_SCRIPT,
  bestStripWord,
  toEngineAction,
} from "../scripts/four-seat-scenario.js";
import appConfig from "../src/app.config.js";

// The room draws its deal seed server-side; the explicit `seed` option is honored only behind
// this gate. The suite boots unseeded rooms too, so only tests that pin a seed need it on.
process.env.WORDPOKER_DETERMINISTIC_SEED = "1";

/** Seed 408's deal and standings after STO-467 changed the bag to choice tiles only. */
const PINNED_408 = {
  winnerSeat: 0,
  standings: [
    { word: "RAIDERS", score: 22 },
    { word: "ERASER", score: 10 },
  ],
};

/** The server-side room as `connectTo` hands it: its state, and a way to wait for a patch. */
type ServerRoom = { state: { phase: string }; waitForNextPatch(): Promise<unknown> };

/**
 * Every seat says ready, and the test waits for the deal that follows: a table deals only once
 * each of its seats — two at least — has said so.
 */
async function readyUp(room: ServerRoom, clients: readonly ClientRoom[]) {
  for (const client of clients) client.send(GAME_MESSAGES.ready, { ready: true });
  for (let patch = 0; patch < 20 && room.state.phase === WAITING_PHASE; patch += 1) {
    await room.waitForNextPatch();
  }
}

/** The board ids a room holds, in order. */
function boardIds(state: unknown): string[] {
  const community = (state as { community?: Iterable<{ id: string }> }).community ?? [];
  return [...community].map((tile) => tile.id);
}

/** Strips schema-only blank alternative faces so plain letters stay plain engine tiles. */
function tileFromRoomState(tile: { toJSON(): unknown }): Tile {
  const state = tile.toJSON() as {
    kind: "choice" | "letter";
    id: string;
    letter: string;
    points: number;
    alternativeLetter: string;
    alternativePoints: number;
    multiplier: string;
  };
  const multiplier = state.multiplier as NonNullable<Tile["multiplier"]> | undefined;
  const shared = {
    id: state.id,
    letter: state.letter,
    points: state.points,
    ...(multiplier ? { multiplier } : {}),
  };
  return state.kind === "choice"
    ? { ...shared, alternativeLetter: state.alternativeLetter, alternativePoints: state.alternativePoints }
    : shared;
}

/** Waits until every client has decoded the server's board: a patch reaches clients async. */
async function clientsCaughtUp(room: { state: unknown }, clients: readonly ClientRoom[]) {
  for (let tick = 0; tick < 50; tick += 1) {
    const expected = boardIds(room.state).join();
    if (clients.every((client) => boardIds(client.state).join() === expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Each client decodes the board the server holds, each tile once: re-projecting a street must
 * not leave the previous street's tiles behind in a client's copy (a duplicate React key at the
 * payout).
 */
function assertBoardDecodesOnce(room: { state: unknown }, clients: readonly ClientRoom[]) {
  for (const client of clients) {
    assert.deepStrictEqual(
      boardIds(client.state),
      boardIds(room.state),
      "the client's board is the server's, each tile once",
    );
  }
}

/**
 * The server, booted once: what a creator may configure, how a full table runs an authoritative
 * hand, and what the lobby sees of the result.
 *
 * One boot for the whole suite, deliberately. Colyseus 0.18's server owns process-global state:
 * booting twice in one process either refuses to listen at all ("Listen method has been called
 * more than once without closing") or leaves the second server unable to answer a matchmaking
 * request (ERR_HTTP_HEADERS_SENT out of the shared router). So the describes below share this
 * server and each one cleans up after itself.
 */
describe("GameRoom", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  const originalAuthOrigin = process.env.AUTH_API_URL;
  // A protocol fixture, not an auth bypass in application code: joins still call the real verifier.
  let accountCount = 0;
  const authServer = createServer((request, response) => {
    const token = request.headers.authorization;
    response.setHeader("content-type", "application/json");
    // `test-session` verifies as a fresh account each join (one seat per account); the others are fixed.
    const id = token === "Bearer test-session" ? `test-account-${(accountCount += 1)}`
      : token === "Bearer second-session" ? "second-account"
      : token === "Bearer same-session" ? "same-account"
      : undefined;
    if (id === undefined) {
      response.end("null");
      return;
    }
    response.end(JSON.stringify({
      user: { id },
      session: { expiresAt: new Date(Date.now() + 60000).toISOString() },
    }));
  });

  before(async () => {
    await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
    const address = authServer.address();
    assert.ok(address && typeof address !== "string");
    process.env.AUTH_API_URL = `http://127.0.0.1:${address.port}`;
    colyseus = await boot(appConfig);
  });
  after(async () => {
    await colyseus.shutdown();
    await new Promise<void>((resolve, reject) => authServer.close((error) => error ? reject(error) : resolve()));
    if (originalAuthOrigin === undefined) delete process.env.AUTH_API_URL;
    else process.env.AUTH_API_URL = originalAuthOrigin;
  });

  beforeEach(async () => {
    await colyseus.cleanup();
    colyseus.sdk.auth.token = "test-session";
  });

  describe("authenticated seats", () => {
    it("rejects anonymous and forged joins before a seat is taken", async () => {
      const room = await colyseus.createRoom("game", { name: "Auth", buyIn: 500, maxSeats: 2 });
      colyseus.sdk.auth.token = "";
      await assert.rejects(colyseus.connectTo(room, { userId: "test-account" }), (error: { code?: number }) => error.code === 401);
      colyseus.sdk.auth.token = "forged-session";
      await assert.rejects(colyseus.connectTo(room), (error: { code?: number }) => error.code === 401);
      assert.equal(room.state.seats.size, 0);
    });

    it("retains verified account identity across reconnects and ignores supplied user IDs", async () => {
      const room = await colyseus.createRoom("game", { name: "Auth reconnect", buyIn: 500, maxSeats: 2, reconnectSeconds: 2 });
      const client = await colyseus.connectTo(room, { userId: "second-account" });
      const userId = room["bindings"].get(client.sessionId)?.userId;
      assert.match(userId ?? "", /^test-account-\d+$/);
      const sessionId = client.sessionId;
      client.reconnection.minUptime = 0;
      client.reconnection.minDelay = 1;
      client.reconnection.maxDelay = 5;
      client.reconnection.backoff = () => 1;
      const reconnected = new Promise<void>((resolve) => client.onReconnect(resolve));
      colyseus.sdk.auth.token = "second-session";
      client.connection.close();
      await reconnected;
      assert.equal(client.sessionId, sessionId);
      assert.equal(room["bindings"].get(sessionId)?.userId, userId);
      assert.equal(room["bindings"].get(sessionId)?.connected, true);
      await client.leave();
    });

    it("refuses a second seat for an account already at the table", async () => {
      const room = await colyseus.createRoom("game", { name: "Auth duplicate", buyIn: 500, maxSeats: 2 });
      colyseus.sdk.auth.token = "same-session";
      const first = await colyseus.connectTo(room);
      await assert.rejects(colyseus.connectTo(room), (error: { code?: number }) => error.code === 409);
      assert.equal(room.state.seats.size, 1);
      await first.leave();
    });
  });

  describe("authoritative hand", () => {
    it("keeps results until each player chooses play another, then waits for readiness", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Results readiness", buyIn: 500, maxSeats: 2, seed: 123,
        payoutDelay: 10, tickMs: 5,
      });
      const clients = [await colyseus.connectTo(room), await colyseus.connectTo(room)];
      await readyUp(room, clients);
      const dealer = room.state.dealerSeat;
      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      const actor = clients.find((client) => client.sessionId === actorId);
      assert.ok(actor);
      actor.send(GAME_MESSAGES.betting, { type: "fold" });
      await room.waitForNextPatch();
      for (let tick = 0; tick < 60; tick += 1) await room.waitForNextTimestep();
      assert.strictEqual(room.state.phase, "payout", "results never expire automatically");
      const stacks = [...room.state.seats.values()].map((seat) => seat.tableStack);
      clients[0]!.send(GAME_MESSAGES.resultsSeen);
      await room.waitForNextPatch();
      assert.strictEqual(room.state.phase, "payout", "the other player can keep reading");
      assert.strictEqual([...room.state.seats.values()].filter((seat) => seat.seenResults).length, 1);
      clients[0]!.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextPatch();
      assert.strictEqual(room.state.seats.get(clients[0]!.sessionId)?.ready, true);
      clients[1]!.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextTimestep();
      assert.strictEqual(room.state.seats.get(clients[1]!.sessionId)?.ready, false, "reading players cannot be readied");
      clients[1]!.send(GAME_MESSAGES.resultsSeen);
      for (let tick = 0; tick < 40 && room.state.phase === "payout"; tick += 1) await room.waitForNextTimestep();
      assert.strictEqual(room.state.phase, WAITING_PHASE);
      assert.strictEqual(room.state.seats.get(clients[0]!.sessionId)?.ready, true, "early readiness is retained");
      assert.deepStrictEqual([...room.state.seats.values()].map((seat) => seat.tableStack), stacks);
      assert.strictEqual(room.state.turnDeadline, 0);
      await readyUp(room, clients);
      assert.strictEqual(room.state.phase, "preflop");
      assert.strictEqual(room.state.handCount, 2);
      assert.notStrictEqual(room.state.dealerSeat, dealer);
      assert.ok([...room.state.seats.values()].every((seat) => !seat.ready && !seat.seenResults));
    });

    it("waits for a full table, deals private racks, and settles a hand", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Hand test",
        buyIn: 500,
        maxSeats: 2,
        seed: 123,
      });
      assert.strictEqual(room.state.phase, "waiting", "empty room is waiting");

      const first = await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "waiting", "one player is not a table");

      const second = await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "waiting", "a seated table waits for its players");
      await readyUp(room, [first, second]);
      assert.strictEqual(room.state.phase, "preflop", "a ready table deals the first round");
      assert.strictEqual(room.state.handCount, 1);
      assert.strictEqual(room.state.community.length, 0, "the unrevealed board stays private");
      assert.strictEqual(room.state.seats.size, 2);
      assert.ok(
        [...room.state.seats.values()].every((seat) => !("rack" in seat)),
        "private racks do not enter the public schema",
      );

      const privateStates = new Map<string, PrivateSeatState>();
      first.onMessage(GAME_EVENTS.privateState, (payload) => {
        privateStates.set(first.sessionId, payload as PrivateSeatState);
      });
      second.onMessage(GAME_EVENTS.privateState, (payload) => {
        privateStates.set(second.sessionId, payload as PrivateSeatState);
      });

      const clients = [first, second];
      const playerForSeat = (seatNumber: number) =>
        [...room.state.seats.values()].find((seat) => seat.seat === seatNumber)?.playerId;
      const clientForPlayer = (playerId: string) =>
        clients.find((client) => client.sessionId === playerId);
      /**
       * The move the row offers a seat: call what it owes, else check (§23). Pre-flop the blinds
       * are already out, so the first actor of every hand owes the big blind.
       */
      const moveFor = (playerId: string): OnlineBettingAction => {
        const seat = room.state.seats.get(playerId);
        const round = room.state.betting;
        assert.ok(seat && round, "an open round and a seated actor");
        return seat.committedThisRound < round.currentBet ? { type: "call" } : { type: "check" };
      };

      const actorId = playerForSeat(room.state.toActSeat);
      assert.ok(actorId, "the server chooses the first actor");
      const actor = clientForPlayer(actorId);
      const other = clients.find((client) => client !== actor);
      assert.ok(actor && other);

      const rejection = new Promise<GameRejectionEvent>((resolve) => {
        other.onMessage(GAME_EVENTS.rejected, (payload) => resolve(payload as GameRejectionEvent));
      });
      other.send(GAME_MESSAGES.betting, { type: "check" });
      assert.deepStrictEqual(await rejection, { action: "betting", reason: "not-your-turn" });

      actor.send(GAME_MESSAGES.betting, moveFor(actorId));
      await room.waitForNextPatch();
      assert.strictEqual(privateStates.size, 2, "each connection receives its private state");
      for (const client of clients) {
        const received = privateStates.get(client.sessionId);
        assert.ok(received, "every connection received its own private state");
        assert.strictEqual(received.playerId, client.sessionId, "the state is the receiving seat's");
        assert.strictEqual(received.seat, room.state.seats.get(client.sessionId)?.seat);
        assert.strictEqual(received.rack.length, 2);
        assert.strictEqual(received.hand, room.state.handCount, "the rack names its own hand");
      }
      assert.notDeepStrictEqual(
        privateStates.get(first.sessionId)?.rack,
        privateStates.get(second.sessionId)?.rack,
        "each seat holds its own rack, not the table's",
      );

      const revealedFor: Record<string, number> = {
        preflop: 0,
        flop: 3,
        turn: 4,
        river: 5,
      };
      for (let action = 0; action < 20 && room.state.wordWindow.status !== "open"; action += 1) {
        const currentActorId = playerForSeat(room.state.toActSeat);
        assert.ok(currentActorId, "the server has an actor");
        const currentActor = clientForPlayer(currentActorId);
        assert.ok(currentActor);
        currentActor.send(GAME_MESSAGES.betting, moveFor(currentActorId));
        await room.waitForNextPatch();
        await clientsCaughtUp(room, clients);
        assertBoardDecodesOnce(room, clients);
        if (room.state.phase in revealedFor) {
          assert.strictEqual(
            room.state.community.length,
            revealedFor[room.state.phase],
            "community reveal matches the current street",
          );
        }
      }
      assert.strictEqual(room.state.wordWindow.status, "open", "betting reaches the word window");
      assert.strictEqual(room.state.community.length, 5, "the full board is public at showdown");

      for (const client of clients) {
        const privateState = privateStates.get(client.sessionId);
        assert.ok(privateState);
        const plays = privateState.rack.map((tile) => ({
          tileId: tile.id,
          ...("alternativeLetter" in tile ? { chosenFace: tile.letter } : {}),
        }));
        client.send(GAME_MESSAGES.confirmWord, { submission: { plays } });
        await room.waitForNextPatch();
      }

      assert.strictEqual(room.state.phase, "payout");
      await clientsCaughtUp(room, clients);
      assertBoardDecodesOnce(room, clients);
      assert.strictEqual(room.state.result.available, true);
      assert.ok(room.state.result.standings.length > 0);
      for (const standing of room.state.result.standings) {
        if (standing.word === "") {
          assert.strictEqual(standing.tiles.length, 0, "a seat with no word reveals no tiles");
          continue;
        }
        assert.ok(standing.tiles.length > 0, "a word that stood reveals its tiles");
        assert.strictEqual(
          standing.base + standing.mult + standing.rack,
          standing.score,
          "§7's parts add up to the score the ladder ranked",
        );
      }
    });

    it("plays a seeded two-seat hand to a pinned payout (STO-408)", async () => {
      // The multiplayer smoke: two clients, one seeded room, a bet and a call, real words, and
      // the settled stacks pinned. Paced by patches alone — no wall-clock sleeps — and a long
      // payout delay keeps the result on the state while it is read.
      const room = await colyseus.createRoom("game", {
        name: "Smoke test",
        buyIn: 500,
        maxSeats: 2,
        seed: 408,
        payoutDelay: 60_000,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const clients = [first, second];
      const racks = new Map<string, PrivateSeatState>();
      const rejections: GameRejectionEvent[] = [];
      for (const client of clients) {
        client.onMessage(GAME_EVENTS.privateState, (payload) => {
          racks.set(client.sessionId, payload as PrivateSeatState);
        });
        client.onMessage(GAME_EVENTS.rejected, (payload) => {
          rejections.push(payload as GameRejectionEvent);
        });
      }
      await readyUp(room, clients);
      assert.strictEqual(room.state.phase, "preflop");
      const buttonSeat = room.state.dealerSeat;
      const smallBlind = room.state.table.smallBlind;
      const bigBlind = room.state.table.bigBlind;
      const smallBlindId = [...room.state.seats.values()].find((seat) => seat.seat === buttonSeat)?.playerId;
      assert.ok(smallBlindId, "the button posts the small blind heads-up");
      const bigBlindId = [...room.state.seats.values()].find((seat) => seat.seat !== buttonSeat)?.playerId;
      assert.ok(bigBlindId, "the other seat posts the big blind heads-up");
      assert.strictEqual(
        room.state.seats.get(smallBlindId)?.committedThisRound,
        smallBlind,
        "the button posts the small blind",
      );
      assert.strictEqual(
        room.state.seats.get(bigBlindId)?.committedThisRound,
        bigBlind,
        "the other seat posts the big blind",
      );

      const actor = () => {
        const id = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
        const client = clients.find((candidate) => candidate.sessionId === id);
        assert.ok(client, "the server names a connected actor");
        return client;
      };
      /** The actor sends one action; the test waits for the turn or the street to move on. */
      const act = async (action: object) => {
        const { phase, toActSeat } = room.state;
        actor().send(GAME_MESSAGES.betting, action);
        for (
          let patch = 0;
          patch < 20 && room.state.phase === phase && room.state.toActSeat === toActSeat;
          patch += 1
        ) {
          await room.waitForNextPatch();
        }
      };

      assert.strictEqual(room.state.toActSeat, buttonSeat, "the button and small blind acts first heads-up");
      assert.strictEqual(actor().sessionId, smallBlindId);
      await act({ type: "call" });
      assert.strictEqual(room.state.phase, "preflop", "the small blind calls the big blind");
      assert.notStrictEqual(room.state.toActSeat, buttonSeat, "the big blind gets its option");
      assert.strictEqual(actor().sessionId, bigBlindId);
      await act({ type: "check" });
      assert.strictEqual(room.state.phase, "flop", "the big blind checks its option");
      assert.strictEqual(room.state.community.length, 3);

      const bet = bigBlind;
      assert.ok(bet > 0, "the flop opens with a minimum bet");
      await act({ type: "bet", amount: bet });
      assert.strictEqual(room.state.betting.currentBet, bet, "the bet is the round's to match");
      await act({ type: "call" });
      assert.strictEqual(room.state.phase, "turn", "a called bet closes the flop");
      const pot = [...room.state.pots].reduce((sum, layer) => sum + layer.amount, 0);
      assert.strictEqual(pot, 2 * (bigBlind + bet), "both seats match the big blind and flop bet");

      for (let action = 0; action < 4 && room.state.wordWindow.status !== "open"; action += 1) {
        await act({ type: "check" });
      }
      assert.strictEqual(room.state.wordWindow.status, "open", "the river's checks open the word window");
      assert.strictEqual(room.state.community.length, 5);

      const dictionary = await loadDictionary();
      const board = [...room.state.community].map(tileFromRoomState);
      for (const client of clients) {
        const privateState = racks.get(client.sessionId);
        assert.ok(privateState?.hand === room.state.handCount, "the seat holds this hand's rack");
        const submission = chooseOfflineWord({ available: [...privateState.rack, ...board], dictionary });
        assert.ok(submission, "the seeded deal gives every seat a word");
        client.send(GAME_MESSAGES.confirmWord, { submission });
      }
      for (let patch = 0; patch < 20 && room.state.phase !== "payout"; patch += 1) {
        await room.waitForNextPatch();
      }

      assert.deepStrictEqual(rejections, [], "all smoke actions, including word confirmations, are accepted");
      assert.strictEqual(room.state.phase, "payout", "both words confirmed settle the hand");
      const { result } = room.state;
      assert.strictEqual(result.available, true);
      const stacks = new Map([...room.state.seats.values()].map((seat) => [seat.playerId, seat.tableStack]));
      assert.strictEqual([...stacks.values()].reduce((sum, stack) => sum + stack, 0), 1_000, "no chip is made or lost");
      assert.ok(stacks.has(result.winner), "the result names a seated winner");
      const loserId = result.winner === smallBlindId ? bigBlindId : smallBlindId;
      const transfer = bigBlind + bet;
      for (const [playerId, stack] of stacks) {
        assert.strictEqual(
          stack,
          playerId === result.winner ? 500 + transfer : 500 - transfer,
          "the winner takes the loser's blind and flop bet",
        );
      }
      // Pinned to seed 408: the same deal, the same words, the same winner, every run.
      const standings = [...result.standings].map(({ word, score }) => ({ word, score }));
      const winnerSeat = room.state.seats.get(result.winner)?.seat;
      assert.deepStrictEqual({ winnerSeat, standings }, PINNED_408);
    });

    it("plays the seeded four-seat session (STO-483)", async () => {
      // The four-browser smoke's script, over sockets: the same seed, actions and words the
      // Maestro flows tap, so an engine change that breaks the smoke fails here in seconds.
      const room = await colyseus.createRoom("game", {
        name: "Four Table",
        buyIn: FOUR_SEAT_BUY_IN,
        maxSeats: 4,
        ...FOUR_SEAT_ROOM,
        payoutDelay: 50,
        tickMs: 5,
      });
      const clients: ClientRoom[] = [];
      const racks = new Map<ClientRoom, PrivateSeatState>();
      const rejections: GameRejectionEvent[] = [];
      for (let seat = 0; seat < 4; seat += 1) {
        const client = await colyseus.connectTo(room);
        client.onMessage(GAME_EVENTS.privateState, (payload) => racks.set(client, payload as PrivateSeatState));
        client.onMessage(GAME_EVENTS.rejected, (payload) => rejections.push(payload as GameRejectionEvent));
        clients.push(client);
      }
      assert.deepStrictEqual(
        clients.map((client) => room.state.seats.get(client.sessionId)?.seat),
        [0, 1, 2, 3],
        "join order is seat order",
      );
      const engine = () => (room as unknown as { game: OfflineState }).game;
      const stacks = () => clients.map((client) => room.state.seats.get(client.sessionId)?.tableStack);
      const until = async (done: () => boolean, what: string) => {
        for (let tick = 0; tick < 200 && !done(); tick += 1) await room.waitForNextTimestep();
        assert.ok(done(), what);
      };

      await readyUp(room, clients);
      const dictionary = await loadDictionary();
      const words: string[][] = [];
      const pots: number[][] = [];
      for (const [handIndex, hand] of FOUR_SEAT_SCRIPT.entries()) {
        const handNumber = handIndex + 1;
        if (handIndex > 0) {
          for (const client of clients) client.send(GAME_MESSAGES.resultsSeen);
          await until(() => room.state.phase === WAITING_PHASE, `hand ${handNumber} waits for readiness`);
          await readyUp(room, clients);
        }
        await until(() => room.state.handCount === handNumber && room.state.phase === "preflop", `hand ${handNumber} deals`);
        if (handIndex === 2) {
          assert.strictEqual(room.state.seats.get(clients[2]!.sessionId)?.sittingOut, true, "the bust sits hand 3 out");
          // The busted seat sees the deal without it, then leaves the table mid-hand.
          await clients[2]!.leave();
        }
        for (const scripted of hand.steps) {
          assert.strictEqual(room.state.toActSeat, scripted.seat, `hand ${handNumber}: seat ${scripted.seat} acts`);
          const { type, ...rest } = toEngineAction(engine(), scripted) as { type: string; playerId: string };
          const { playerId: _playerId, ...amount } = rest;
          // Every accepted action replaces the engine's state; a rejection leaves it be.
          const before = engine();
          clients[scripted.seat]!.send(GAME_MESSAGES.betting, { type, ...amount });
          await until(() => engine() !== before, `hand ${handNumber}: seat ${scripted.seat} ${scripted.action} lands`);
        }
        assert.strictEqual(room.state.wordWindow.status, "open", `hand ${handNumber}: the river opens the window`);

        await clientsCaughtUp(room, clients);
        const board = [...room.state.community].map(tileFromRoomState);
        for (const seat of hand.words) {
          const rack = racks.get(clients[seat]!);
          assert.ok(rack?.hand === handNumber, `hand ${handNumber}: seat ${seat} holds this hand's rack`);
          const word = bestStripWord([...rack.rack, ...board], dictionary);
          assert.ok(word, `hand ${handNumber}: seat ${seat} spells a word by taps`);
          clients[seat]!.send(GAME_MESSAGES.confirmWord, { submission: word.submission });
        }
        await until(() => room.state.phase === "payout", `hand ${handNumber} settles`);
        words.push([...room.state.result.standings].map((standing) => standing.word));
        pots.push(engine().result!.payout.pots.map((pot) => pot.amount));

        if (handIndex === 0) assert.deepStrictEqual(stacks(), [500, 580, 460, 460], "P2 wins hand 1; P3 and P4 lose 40");
        if (handIndex === 1) {
          assert.ok(pots[1]!.length >= 2, "the shove leaves a side pot");
          assert.strictEqual(stacks()[2], 0, "P3's shove loses and busts");
        }
      }
      assert.deepStrictEqual(rejections, [], "every scripted action and word is accepted");
      assert.deepStrictEqual(words, [
        ["JAY", "NARY", "ERY"],
        ["HEIDI", "QI", "NIDI"],
        ["DZ", "XL", "ACLU"],
      ]);
      assert.deepStrictEqual(pots, [[120], [40, 1350, 20], [30]]);

      // P3 left: the remaining seats leave results, then ready up again.
      for (const client of [clients[0]!, clients[1]!, clients[3]!]) client.send(GAME_MESSAGES.resultsSeen);
      await until(() => room.state.phase === WAITING_PHASE, "the leave returns the table to waiting");
      assert.strictEqual(room.state.seats.size, 3);
      const stayed = [clients[0]!, clients[1]!, clients[3]!];
      await readyUp(room, stayed);
      assert.strictEqual(room.state.phase, "preflop", "hand 4 deals 3-handed");
      assert.strictEqual(engine().seats.length, 3);
    });

    it("deals a short table once every seat is ready, and not before", async () => {
      const room = await colyseus.createRoom("game", { name: "Ready test", buyIn: 500, maxSeats: 4 });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const third = await colyseus.connectTo(room);

      first.send(GAME_MESSAGES.ready, { ready: true });
      second.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextPatch();
      await room.waitForNextPatch();
      assert.strictEqual(room.state.phase, WAITING_PHASE, "one seat not ready holds the deal");
      assert.deepStrictEqual(
        [...room.state.seats.values()].map((seat) => seat.ready).sort(),
        [false, true, true],
        "each seat's ready is public",
      );

      first.send(GAME_MESSAGES.ready, { ready: false });
      third.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextPatch();
      await room.waitForNextPatch();
      assert.strictEqual(room.state.phase, WAITING_PHASE, "a seat can take its ready back");

      await readyUp(room, [first]);
      assert.strictEqual(room.state.phase, "preflop", "three of four seats, all ready, is a table");
      assert.strictEqual(room.state.seats.size, 3);
    });

    it("never deals a table of one, however ready", async () => {
      const room = await colyseus.createRoom("game", { name: "Solo", buyIn: 500, maxSeats: 4 });
      const only = await colyseus.connectTo(room);
      only.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextPatch();
      assert.strictEqual(room.state.phase, WAITING_PHASE);
    });

    it("deals when the one seat the table waited on leaves", async () => {
      const room = await colyseus.createRoom("game", { name: "Leaver", buyIn: 500, maxSeats: 4 });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const third = await colyseus.connectTo(room);
      first.send(GAME_MESSAGES.ready, { ready: true });
      second.send(GAME_MESSAGES.ready, { ready: true });
      await room.waitForNextPatch();
      await third.leave();
      for (let patch = 0; patch < 20 && room.state.phase === WAITING_PHASE; patch += 1) {
        await room.waitForNextPatch();
      }
      assert.strictEqual(room.state.phase, "preflop");
    });

    it("sends a seat past an empty table seat its own rack", async () => {
      const room = await colyseus.createRoom("game", { name: "Gap", buyIn: 500, maxSeats: 4 });
      const first = await colyseus.connectTo(room);
      const leaver = await colyseus.connectTo(room);
      const third = await colyseus.connectTo(room);
      await leaver.leave();
      await room.waitForNextPatch();

      // Table seat 2, engine seat 1: the rack is the engine's seat for this player, not index 2.
      let received: PrivateSeatState | undefined;
      third.onMessage(GAME_EVENTS.privateState, (payload) => (received = payload as PrivateSeatState));
      await readyUp(room, [first, third]);
      for (let tick = 0; tick < 50 && received?.hand !== room.state.handCount; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.strictEqual(room.state.seats.get(third.sessionId)?.seat, 2);
      assert.strictEqual(received?.rack.length, 2, "the seat past the gap holds its own rack");
    });

    it("runs a dropped seat's own turn clock and folds it at the deadline (§29)", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Disconnect test",
        buyIn: 500,
        maxSeats: 2,
        seed: 456,
        turnDuration: 300,
        tickMs: 5,
        payoutDelay: 10,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      await readyUp(room, [first, second]);
      assert.strictEqual(room.state.phase, "preflop", "a ready table starts");

      const actorSeat = room.state.toActSeat;
      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === actorSeat)?.playerId;
      assert.ok(actorId, "the disconnecting seat has an id");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);
      const other = [first, second].find((client) => client.sessionId !== actorId);
      assert.ok(other);

      // Drop the connection for real — no consented leave. §29 keeps the seat and its stack for
      // the reconnect hold, and the seat keeps its turn: it is not folded when action reaches it.
      actor.reconnection.enabled = false;
      actor.connection.close();
      for (let tick = 0; tick < 40 && room.state.seats.get(actorId)?.connected !== false; tick += 1) {
        await room.waitForNextTimestep();
      }

      const held = room.state.seats.get(actorId);
      assert.strictEqual(held?.connected, false, "the drop reached the room");
      assert.strictEqual(held?.seat, actorSeat, "the dropped seat keeps its reserved spot");
      assert.strictEqual(held?.hasFolded, false, "a dropped seat is not folded on arrival");
      assert.strictEqual(room.state.toActSeat, actorSeat, "the hand waits on the seat's own clock");
      assert.ok(room.state.turnDeadline > room.state.now, "the dropped seat's clock is running");

      for (let tick = 0; tick < 120 && room.state.seats.get(actorId)?.hasFolded !== true; tick += 1) {
        await room.waitForNextTimestep();
      }

      assert.strictEqual(room.state.seats.get(actorId)?.hasFolded, true, "it folds at its deadline");
      assert.strictEqual(room.state.seats.get(actorId)?.seat, actorSeat, "the spot stays reserved");
      assert.strictEqual(room.state.phase, "payout", "heads-up fold-out pays the other seat");
      assert.strictEqual(room.state.seats.get(other.sessionId)?.hasFolded, false);
    });

    it("folds a seat that leaves for good out of the running hand (§28, §29)", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Leave test",
        buyIn: 500,
        maxSeats: 2,
        seed: 456,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      await readyUp(room, [first, second]);
      assert.strictEqual(room.state.phase, "preflop", "a ready table starts");

      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      assert.ok(actorId, "the leaving seat has an id");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);

      // A consented leave, not a drop: this seat is gone for good, so the room takes it out of
      // the hand in progress (§28/§29's removal) instead of waiting on a clock it will never
      // answer. Its committed chips stay in the pot, and the seat keeps its own place in the
      // schema while the hand it left finishes.
      await actor.leave();
      await room.waitForNextPatch();

      assert.strictEqual(room.state.seats.get(actorId)?.hasFolded, true, "the departed seat folds");
      assert.notStrictEqual(room.state.phase, "waiting", "the hand runs on for the seats that remain");
      const other = [first, second].find((client) => client.sessionId !== actorId);
      assert.ok(other);
      assert.strictEqual(room.state.seats.get(other.sessionId)?.hasFolded, false);
    });

    it("folds a seat dropped on its own turn once the tick reaches its deadline (§29)", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Drop at deadline",
        buyIn: 500,
        maxSeats: 2,
        seed: 654,
        // Longer than a patch interval, so the clock is still running when `readyUp` sees the deal.
        turnDuration: 150,
        tickMs: 5,
        payoutDelay: 10,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      await readyUp(room, [first, second]);
      assert.strictEqual(room.state.phase, "preflop", "a ready table starts");

      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      assert.ok(actorId, "the server chooses the first actor");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);

      // Drop the connection for real — no consented leave: the seat stays held for reconnection
      // while the room's tick reaches its deadline, which is where the fold used to throw.
      actor.reconnection.enabled = false;
      actor.connection.close();

      for (let tick = 0; tick < 80 && room.state.seats.get(actorId)?.hasFolded !== true; tick += 1) {
        await room.waitForNextTimestep();
      }

      assert.strictEqual(room.state.seats.get(actorId)?.hasFolded, true, "the dropped actor folds");
      assert.strictEqual(room.state.phase, "payout", "heads-up fold-out pays the other seat");

      const other = [first, second].find((client) => client.sessionId !== actorId);
      assert.ok(other);
      assert.strictEqual(room.state.seats.get(other.sessionId)?.hasFolded, false);
    });

    it("restores a reconnecting seat's rack, draft, place, and word clock (section 29)", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Reconnect restore test",
        buyIn: 500,
        maxSeats: 2,
        seed: 123,
        tickMs: 5,
        reconnectSeconds: 1,
      });
      const first = await colyseus.connectTo(room);
      const privateStates = new Map<string, PrivateSeatState>();
      first.onMessage(GAME_EVENTS.privateState, (payload) => {
        privateStates.set(first.sessionId, payload as PrivateSeatState);
      });

      const second = await colyseus.connectTo(room);
      second.onMessage(GAME_EVENTS.privateState, (payload) => {
        privateStates.set(second.sessionId, payload as PrivateSeatState);
      });
      await readyUp(room, [first, second]);

      const playerForSeat = (seatNumber: number) =>
        [...room.state.seats.values()].find((seat) => seat.seat === seatNumber)?.playerId;
      const clientForPlayer = (playerId: string) =>
        [first, second].find((client) => client.sessionId === playerId);
      /** Call what the seat owes, else check — pre-flop the first actor owes the big blind (§23). */
      const moveFor = (playerId: string): OnlineBettingAction => {
        const seat = room.state.seats.get(playerId);
        const round = room.state.betting;
        assert.ok(seat && round, "an open round and a seated actor");
        return seat.committedThisRound < round.currentBet ? { type: "call" } : { type: "check" };
      };

      // Make one legal move so both private snapshots have arrived before the test starts
      // comparing state. The first seat is deliberately the one that reconnects below.
      const openingActorId = playerForSeat(room.state.toActSeat);
      assert.ok(openingActorId);
      clientForPlayer(openingActorId)?.send(GAME_MESSAGES.betting, moveFor(openingActorId));
      await room.waitForNextPatch();

      const beforeWord = privateStates.get(first.sessionId);
      assert.ok(beforeWord && beforeWord.rack.length > 0, "the reconnecting seat has a rack");
      const rackIds = beforeWord.rack.map((tile) => tile.id);

      for (let action = 0; action < 20 && room.state.wordWindow.status !== "open"; action += 1) {
        const actorId = playerForSeat(room.state.toActSeat);
        assert.ok(actorId, "the server has an actor");
        clientForPlayer(actorId)?.send(GAME_MESSAGES.betting, moveFor(actorId));
        await room.waitForNextPatch();
      }
      assert.strictEqual(room.state.wordWindow.status, "open", "the hand reaches the word window");

      const draftTile = beforeWord.rack.find((tile) => !("alternativeLetter" in tile));
      assert.ok(draftTile, "the fixture gives the reconnecting seat a single-letter tile");
      const draft = {
        plays: [
          {
            tileId: draftTile.id,
            ...("alternativeLetter" in draftTile ? { chosenFace: draftTile.letter } : {}),
          },
        ],
      };
      const drafted = new Promise<PrivateSeatState>((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error("timed out waiting for the draft")), 5_000);
        first.onMessage(GAME_EVENTS.privateState, (payload) => {
          const state = payload as PrivateSeatState;
          if (state.word.status !== "drafting" || state.word.draft === null) return;
          clearTimeout(deadline);
          resolve(state);
        });
      });
      first.send(GAME_MESSAGES.draftWord, { submission: draft });
      const draftedState = await drafted;
      const deadlineBeforeReconnect = room.state.wordWindow.deadline;
      const seatBeforeReconnect = draftedState.seat;

      first.reconnection.minUptime = 0;
      first.reconnection.minDelay = 1;
      first.reconnection.maxDelay = 5;
      first.reconnection.backoff = () => 1;

      let reconnected = false;
      const restored = new Promise<PrivateSeatState>((resolve, reject) => {
        const deadline = setTimeout(() => reject(new Error("timed out waiting for reconnection")), 5_000);
        first.onReconnect.once(() => {
          reconnected = true;
        });
        first.onMessage(GAME_EVENTS.privateState, (payload) => {
          const state = payload as PrivateSeatState;
          if (!reconnected || state.word.status !== "drafting" || state.word.draft === null) return;
          clearTimeout(deadline);
          resolve(state);
        });
      });
      first.connection.close();

      const restoredState = await restored;
      assert.strictEqual(restoredState.playerId, first.sessionId);
      assert.strictEqual(restoredState.seat, seatBeforeReconnect, "reconnect keeps the same seat");
      assert.deepStrictEqual(restoredState.rack.map((tile) => tile.id), rackIds);
      assert.deepStrictEqual(restoredState.word.draft, draftedState.word.draft);
      assert.strictEqual(room.state.seats.get(first.sessionId)?.connected, true);
      assert.strictEqual(room.state.seats.get(first.sessionId)?.seat, seatBeforeReconnect);
      assert.strictEqual(
        room.state.wordWindow.deadline,
        deadlineBeforeReconnect,
        "reconnect does not restart the shared word clock",
      );
    });

    it("folds an idle actor at the configured turn deadline, even with nothing owed", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Timeout test",
        buyIn: 500,
        maxSeats: 2,
        seed: 789,
        turnDuration: 200,
        tickMs: 5,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      await readyUp(room, [first, second]);

      // Heads-up the button posts the small blind, so the small blind is the first actor and the
      // turn its call hands on is the big blind's option — the seat that owes nothing (§15).
      const smallBlindSeat = room.state.toActSeat;
      const smallBlindId = [...room.state.seats.values()].find((seat) => seat.seat === smallBlindSeat)?.playerId;
      assert.ok(smallBlindId, "the small blind is to act first");
      const smallBlind = [first, second].find((client) => client.sessionId === smallBlindId);
      assert.ok(smallBlind);
      smallBlind.send(GAME_MESSAGES.betting, { type: "call" });
      await room.waitForNextPatch();

      const actorSeat = room.state.toActSeat;
      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === actorSeat)?.playerId;
      console.log("DEBUG", {
        smallBlindSeat,
        smallBlindId,
        actorSeat,
        phase: room.state.phase,
        seats: [...room.state.seats.values()].map((s) => ({
          seat: s.seat,
          id: s.playerId,
          committed: s.committedThisRound,
          folded: s.hasFolded,
        })),
      });
      assert.ok(actorId && actorId !== smallBlindId, "the big blind's option is the turn left");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);

      const timeout = new Promise<GameRejectionEvent>((resolve) => {
        actor.onMessage(GAME_EVENTS.rejected, (payload) => resolve(payload as GameRejectionEvent));
      });
      for (let tick = 0; tick < 80 && room.state.seats.get(actorId)?.hasFolded !== true; tick += 1) {
        await room.waitForNextTimestep();
      }

      // §15/ADR 0006: the expiry folds, even though this seat owed nothing and could have
      // checked, and the seat is told its turn expired.
      assert.strictEqual(room.state.seats.get(actorId)?.hasFolded, true, "nothing owed still folds");
      assert.deepStrictEqual(await timeout, { action: "betting", reason: "turn-timeout" });

    });

    it("returns the table to waiting when the session cannot pay another hand", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Session end test",
        buyIn: 500,
        maxSeats: 2,
        seed: 321,
        payoutDelay: 100,
        tickMs: 5,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const clients = [first, second];
      await readyUp(room, clients);

      const privateStates = new Map<string, PrivateSeatState>();
      for (const client of clients) {
        client.onMessage(GAME_EVENTS.privateState, (payload) => {
          privateStates.set(client.sessionId, payload as PrivateSeatState);
        });
      }

      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      assert.ok(actorId, "the server chooses the first actor");
      const actor = clients.find((client) => client.sessionId === actorId);
      const other = clients.find((client) => client !== actor);
      assert.ok(actor && other);

      actor.send(GAME_MESSAGES.betting, { type: "allIn" });
      await room.waitForNextPatch();
      other.send(GAME_MESSAGES.betting, { type: "allIn" });
      await room.waitForNextPatch();
      assert.strictEqual(room.state.wordWindow.status, "open", "the all-in showdown opens the word window");

      for (const client of clients) {
        const privateState = privateStates.get(client.sessionId);
        assert.ok(privateState, "the seat received its rack");
        const plays = privateState.rack.map((tile) => ({
          tileId: tile.id,
          ...("alternativeLetter" in tile ? { chosenFace: tile.letter } : {}),
        }));
        client.send(GAME_MESSAGES.confirmWord, { submission: { plays } });
      }

      for (let tick = 0; tick < 10 && room.state.phase !== "payout"; tick += 1) {
        await room.waitForNextTimestep();
      }
      assert.equal(room.state.phase, "payout", "the hand settles at payout");
      assert.strictEqual(room.state.turnDeadline, 0, "no betting turn is open at payout");

      for (const client of clients) client.send(GAME_MESSAGES.resultsSeen);
      // Once everyone leaves results, no hand is dealt, and the room
      // holds both seats and their ended stacks instead of dealing a hand nobody can pay.
      for (let tick = 0; tick < 60 && room.state.phase !== "waiting"; tick += 1) {
        await room.waitForNextTimestep();
      }

      assert.strictEqual(room.state.phase, "waiting", "the room waits for a payable table");
      assert.strictEqual(room.state.sessionOver, false);
      const stacks = [...room.state.seats.values()].map((seat) => seat.tableStack).sort((a, b) => a - b);
      assert.deepStrictEqual(stacks, [0, 1_000], "the ended stacks are held");
    });

    it("gates a client-chosen seed behind the deterministic env var", async () => {
      const previous = process.env.WORDPOKER_DETERMINISTIC_SEED;
      delete process.env.WORDPOKER_DETERMINISTIC_SEED;

      const racks: string[] = [];
      try {
        for (let table = 0; table < 2; table += 1) {
          const room = await colyseus.createRoom("game", {
            name: "Seed gate",
            buyIn: 500,
            maxSeats: 2,
            seed: 123,
          });
          const first = await colyseus.connectTo(room);
          const seated = new Promise<PrivateSeatState>((resolve) => {
            first.onMessage(GAME_EVENTS.privateState, (payload) => {
              const state = payload as PrivateSeatState;
              if (state.rack.length > 0) resolve(state);
            });
          });
          const second = await colyseus.connectTo(room);
          await readyUp(room, [first, second]);
          const { rack } = await seated;
          racks.push(rack.map((tile) => tile.id).sort().join(","));
        }
      } finally {
        if (previous === undefined) delete process.env.WORDPOKER_DETERMINISTIC_SEED;
        else process.env.WORDPOKER_DETERMINISTIC_SEED = previous;
      }

      // The default's unpredictability is not black-box observable; this pins the gate: a
      // client-chosen seed must not determine the deal.
      assert.strictEqual(racks.length, 2);
      assert.notStrictEqual(racks[0], racks[1], "two gates-off rooms must not replay one seed");
    });

    it("takes the smoke runner's room knobs from the env only behind the gate (STO-483)", async () => {
      const previousGate = process.env.WORDPOKER_DETERMINISTIC_SEED;
      const previousKnobs = process.env.WORDPOKER_SMOKE_ROOM;
      process.env.WORDPOKER_SMOKE_ROOM = JSON.stringify({ seed: 4040, payoutDelay: 20_000, turnDuration: 120_000 });
      type Knobs = { seed: number; turnDuration: number };
      const knobsOf = (room: unknown) => {
        const { seed, turnDuration } = room as Knobs;
        return { seed, turnDuration };
      };
      try {
        const lobbyForm = await colyseus.createRoom("game", { name: "Env knobs", buyIn: 500, maxSeats: 4 });
        assert.deepStrictEqual(
          knobsOf(lobbyForm),
          { seed: 4040, turnDuration: 120_000 },
          "a create that names no knobs takes the env's",
        );

        const explicit = await colyseus.createRoom("game", {
          name: "Env knobs",
          buyIn: 500,
          maxSeats: 4,
          seed: 7,
          payoutDelay: 50,
        });
        assert.deepStrictEqual(
          knobsOf(explicit),
          { seed: 7, turnDuration: 120_000 },
          "knobs the create names win over the env's",
        );

        delete process.env.WORDPOKER_DETERMINISTIC_SEED;
        const ungated = knobsOf(await colyseus.createRoom("game", { name: "Env knobs", buyIn: 500, maxSeats: 4 }));
        assert.notStrictEqual(ungated.turnDuration, 120_000, "without the gate the env is ignored");
      } finally {
        if (previousGate === undefined) delete process.env.WORDPOKER_DETERMINISTIC_SEED;
        else process.env.WORDPOKER_DETERMINISTIC_SEED = previousGate;
        if (previousKnobs === undefined) delete process.env.WORDPOKER_SMOKE_ROOM;
        else process.env.WORDPOKER_SMOKE_ROOM = previousKnobs;
      }
    });

    it("takes the smoke runner's power-up setting when the create names none (STO-498)", async () => {
      const previousGate = process.env.WORDPOKER_DETERMINISTIC_SEED;
      const previousKnobs = process.env.WORDPOKER_SMOKE_ROOM;
      process.env.WORDPOKER_DETERMINISTIC_SEED = "1";
      process.env.WORDPOKER_SMOKE_ROOM = JSON.stringify({ powerUps: { deal: "choose3" } });
      const table = { name: "Env powers", buyIn: 500, maxSeats: 2 } as const;
      try {
        const unnamed = await colyseus.createRoom("game", table);
        assert.deepStrictEqual(unnamed.metadata.powerUps, { deal: "choose3" }, "the env's setting");

        const named = await colyseus.createRoom("game", { ...table, powerUps: { deal: "off" } });
        assert.deepStrictEqual(named.metadata.powerUps, { deal: "off" }, "the create's own wins");

        delete process.env.WORDPOKER_DETERMINISTIC_SEED;
        const ungated = await colyseus.createRoom("game", table);
        assert.deepStrictEqual(ungated.metadata.powerUps, { deal: "off" }, "no gate, no env");

        process.env.WORDPOKER_DETERMINISTIC_SEED = "1";
        process.env.WORDPOKER_SMOKE_ROOM = JSON.stringify({ powerUps: { deal: "chaos" } });
        await assert.rejects(colyseus.createRoom("game", table), "a malformed env setting is refused too");
      } finally {
        if (previousGate === undefined) delete process.env.WORDPOKER_DETERMINISTIC_SEED;
        else process.env.WORDPOKER_DETERMINISTIC_SEED = previousGate;
        if (previousKnobs === undefined) delete process.env.WORDPOKER_SMOKE_ROOM;
        else process.env.WORDPOKER_SMOKE_ROOM = previousKnobs;
      }
    });
  });

  describe("create options", () => {
    it("takes the config the create named", async () => {
      const room = await colyseus.createRoom("game", {
        name: "High Stakes",
        buyIn: 50_000,
        maxSeats: 4,
      });

      assert.strictEqual(room.maxClients, 4, "the seat cap is the room's own");
      assert.strictEqual(room.state.table.name, "High Stakes");
      assert.strictEqual(room.state.table.buyIn, 50_000);
      assert.strictEqual(room.state.table.smallBlind, 500, "ADR 0004: 1% of the buy-in");
      assert.strictEqual(room.state.table.bigBlind, 1_000, "ADR 0004: 2% of the buy-in");
      assert.strictEqual(room.state.table.maxSeats, 4);
    });

    it("publishes the config as the room's matchmaking metadata", async () => {
      const room = await colyseus.createRoom("game", { name: "Beginner", buyIn: 500, maxSeats: 2 });

      assert.deepStrictEqual(room.metadata, {
        name: "Beginner",
        buyIn: 500,
        smallBlind: 5,
        bigBlind: 10,
        maxSeats: 2,
        powerUps: { deal: "off" },
        status: "waiting",
      });
    });

    it("publishes a Wild table's deal mode", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Wild",
        buyIn: 500,
        maxSeats: 2,
        powerUps: { deal: "choose3" },
      });

      assert.deepStrictEqual(room.metadata.powerUps, { deal: "choose3" });
      assert.strictEqual(room.state.table.powerUps.deal, "choose3", "the joined state carries it");
    });

    it("syncs a Classic table's deal mode into the joined state", async () => {
      const room = await colyseus.createRoom("game", { name: "Plain", buyIn: 500, maxSeats: 2 });
      const client = await colyseus.connectTo(room);
      await room.waitForNextPatch();

      assert.strictEqual(room.state.table.powerUps.deal, "off");
      assert.strictEqual((client.state as { table: { powerUps: { deal: string } } }).table.powerUps.deal, "off");
    });

    it("trims the name it stores", async () => {
      const room = await colyseus.createRoom("game", { name: "  Sunset  ", buyIn: 5_000, maxSeats: 4 });

      assert.strictEqual(room.state.table.name, "Sunset");
      assert.strictEqual(room.metadata.name, "Sunset");
    });

    for (const [what, options] of [
      ["an empty name", { name: "   ", buyIn: 500, maxSeats: 2 }],
      ["an over-long name", { name: "x".repeat(33), buyIn: 500, maxSeats: 2 }],
      ["a buy-in §2 does not offer", { name: "Table", buyIn: 1_234, maxSeats: 2 }],
      ["fewer than two seats", { name: "Table", buyIn: 500, maxSeats: 1 }],
      ["more than four seats", { name: "Table", buyIn: 500, maxSeats: 5 }],
      ["a fractional seat count", { name: "Table", buyIn: 500, maxSeats: 3.5 }],
      ["a deal mode no table runs", { name: "Table", buyIn: 500, maxSeats: 2, powerUps: { deal: "chaos" } }],
      ["no config at all", {}],
    ] as const) {
      it(`refuses ${what}`, async () => {
        await assert.rejects(
          colyseus.createRoom("game", options),
          (error: Error) => error.message.length > 0,
        );
      });
    }

    it("hands the client the sentence the config was refused with", async () => {
      await assert.rejects(
        colyseus.sdk.create("game", { name: "Table", buyIn: 500, maxSeats: 9 }),
        (error: Error) => /whole number from 2 to 4/.test(error.message),
      );
    });
  });

  describe("lobby listings", () => {
    /** One listing entry as the lobby pushes it — the untyped half of the wire. */
    interface Listing {
      roomId: string;
      name: string;
      clients: number;
      maxClients: number;
      locked?: boolean;
      metadata?: Record<string, unknown>;
    }

    /**
     * The lobby subscription as a client keeps it: `rooms` is the initial list, `+` an add or a
     * change, `-` a removal. This mirrors what the screen's hook folds into its rows.
     */
    function followLobby(lobby: ClientRoom) {
      const rows = new Map<string, Listing>();
      const parked: Array<() => void> = [];
      const wake = () => parked.splice(0).forEach((check) => check());

      lobby.onMessage("rooms", (listings: Listing[]) => {
        rows.clear();
        listings.forEach((listing) => rows.set(listing.roomId, listing));
        wake();
      });
      lobby.onMessage("+", ([roomId, listing]: [string, Listing]) => {
        rows.set(roomId, listing);
        wake();
      });
      lobby.onMessage("-", (roomId: string) => {
        rows.delete(roomId);
        wake();
      });

      return {
        rows,
        /**
         * Hand the rows back once the subscription shows what the test waits for. Purely
         * event-driven — a push wakes it — with a deadline only so a missing push fails loudly
         * instead of hanging.
         */
        async until(condition: (rows: Map<string, Listing>) => boolean, what: string) {
          if (condition(rows)) return rows;

          return new Promise<Map<string, Listing>>((resolve, reject) => {
            const deadline = setTimeout(
              () => reject(new Error(`timed out waiting for ${what}`)),
              5_000,
            );
            parked.push(() => {
              if (!condition(rows)) return;
              clearTimeout(deadline);
              resolve(rows);
            });
          });
        },
      };
    }

    /** A lobby subscription, asked for the current list rather than waiting for the join push. */
    async function subscribe() {
      colyseus.sdk.auth.token = "";
      const lobby = await colyseus.sdk.joinOrCreate("lobby");
      colyseus.sdk.auth.token = "test-session";
      const followed = followLobby(lobby);
      lobby.send("filter");
      return { lobby, followed };
    }

    it("lists an open table with its config, and follows its seats live", async () => {
      const table = await colyseus.createRoom("game", { name: "Sunset", buyIn: 5_000, maxSeats: 3 });
      const { followed } = await subscribe();

      const listed = (await followed.until((rows) => rows.size > 0, "the new table"))!.get(table.roomId)!;
      assert.strictEqual(listed.clients, 0);
      assert.strictEqual(listed.maxClients, 3, "the seat cap the table was created with");
      assert.deepStrictEqual(listed.metadata, {
        name: "Sunset",
        buyIn: 5_000,
        smallBlind: 50,
        bigBlind: 100,
        maxSeats: 3,
        powerUps: { deal: "off" },
        status: WAITING_PHASE,
      });

      await colyseus.connectTo(table);
      const seated = (await followed.until((rows) => rows.get(table.roomId)!.clients === 1, "a seat to fill"))!
        .get(table.roomId)!;
      assert.strictEqual(seated.metadata!.status, WAITING_PHASE, "one seat of three is still waiting");
    });

    it("keeps a full table listed, marked locked, and reads it as in hand", async () => {
      const table = await colyseus.createRoom("game", { name: "Heads up", buyIn: 500, maxSeats: 2 });
      const { followed } = await subscribe();
      await followed.until((rows) => rows.has(table.roomId), "the new table");

      const players = [await colyseus.connectTo(table), await colyseus.connectTo(table)];
      await readyUp(table, players);

      const full = (await followed.until((rows) => rows.get(table.roomId)!.locked === true, "the table to lock"))!
        .get(table.roomId)!;
      assert.strictEqual(full.clients, 2, "a full table stays listed rather than vanishing (§3)");
      assert.strictEqual(full.metadata!.status, "preflop", "a full table is playing");
    });

    it("keeps the hand running while a dropped seat is held for reconnection", async () => {
      const table = await colyseus.createRoom("game", { name: "Heads up", buyIn: 500, maxSeats: 2 });
      const { followed } = await subscribe();
      await followed.until((rows) => rows.has(table.roomId), "the new table");

      const first = await colyseus.connectTo(table);
      const second = await colyseus.connectTo(table);
      await readyUp(table, [first, second]);
      await followed.until((rows) => rows.get(table.roomId)!.locked === true, "the table to lock");

      // Heads-up the button posts the small blind and is the seat the hand opens on, so the seat
      // whose drop the table holds rather than folds is the big blind — the one not to act (§15).
      assert.strictEqual(table.state.seats.get(first.sessionId)?.seat, 0);
      assert.strictEqual(table.state.seats.get(second.sessionId)?.seat, 1);
      assert.strictEqual(table.state.toActSeat, 0, "the small blind opens the hand");
      await second.leave();
      const reopened = (await followed.until((rows) => rows.get(table.roomId)!.locked !== true, "the seat to free"))!
        .get(table.roomId)!;
      assert.strictEqual(reopened.clients, 1);
      assert.strictEqual(reopened.metadata!.status, "preflop", "the hand continues during reconnect hold");
    });

    it("drops a table from the list once it disposes", async () => {
      const table = await colyseus.createRoom("game", { name: "Short lived", buyIn: 500, maxSeats: 2 });
      const { followed } = await subscribe();
      await followed.until((rows) => rows.has(table.roomId), "the new table");

      await table.disconnect();

      await followed.until((rows) => !rows.has(table.roomId), "the table to go away");
    });

    it("does not list the lobby itself", async () => {
      await colyseus.createRoom("game", { name: "Sunset", buyIn: 500, maxSeats: 2 });
      const { followed } = await subscribe();

      const rows = await followed.until((rows) => rows.size > 0, "the tables");
      assert.ok(
        [...rows.values()].every((listing) => listing.name === "game"),
        "only tables are listed, not the subscription room every client sits in",
      );
    });
  });

  describe("power-ups (STO-499)", () => {
    /** Every targeted or broadcast event one client received, in order. */
    type Inbox = { type: string; payload: unknown }[];

    function listen(client: ClientRoom): Inbox {
      const inbox: Inbox = [];
      for (const type of Object.values(GAME_EVENTS)) {
        client.onMessage(type, (payload) => inbox.push({ type, payload }));
      }
      return inbox;
    }

    function ofType<T>(inbox: Inbox, type: string): T[] {
      return inbox.filter((message) => message.type === type).map((message) => message.payload as T);
    }

    function last<T>(inbox: Inbox, type: string): T | undefined {
      return ofType<T>(inbox, type).at(-1);
    }

    /** A power refusal's action id; the betting and word refusals carry none. */
    function actionIdOf(event: GameRejectionEvent | undefined): string | undefined {
      return event !== undefined && "actionId" in event ? event.actionId : undefined;
    }

    /** Polls until `read` gives a value: events arrive between patches, so a patch is no clock. */
    async function until<T>(read: () => T | undefined | false, what: string, ms = 5_000): Promise<T> {
      const deadline = Date.now() + ms;
      for (;;) {
        const value = read();
        if (value !== undefined && value !== false) return value;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    /** A heads-up Wild table, dealt, with both seats' Power Draws in hand. */
    async function wildTable(seed: number, knobs: Record<string, unknown> = {}) {
      const room = await colyseus.createRoom("game", {
        name: "Wild test",
        buyIn: 500,
        maxSeats: 2,
        seed,
        tickMs: 5,
        powerUps: { deal: "choose3" },
        ...knobs,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const inboxes = new Map([
        [first.sessionId, listen(first)],
        [second.sessionId, listen(second)],
      ]);
      await readyUp(room, [first, second]);
      await until(
        () => [...inboxes.values()].every((inbox) => last(inbox, GAME_EVENTS.powerDraw) !== undefined),
        "both seats' draws",
      );
      const inboxOf = (client: ClientRoom) => inboxes.get(client.sessionId)!;
      return { room, clients: [first, second] as const, inboxOf };
    }

    /** Both seats keep Random Wild; the draw closes and the seat on the turn is returned first. */
    async function bothPickWild(table: Awaited<ReturnType<typeof wildTable>>) {
      for (const client of table.clients) {
        client.send(GAME_MESSAGES.pickPower, {
          actionId: `pick-${client.sessionId}`,
          handId: 1,
          powerUpId: "random_wild",
        });
      }
      await until(() => table.room.state.toActSeat >= 0, "the draw to close and pre-flop to start");

      const actor = table.clients.find(
        (client) => table.room.state.seats.get(client.sessionId)?.seat === table.room.state.toActSeat,
      )!;
      const opponent = table.clients.find((client) => client !== actor)!;
      await until(
        () => last<PrivateSeatState>(table.inboxOf(actor), GAME_EVENTS.privateState)?.power?.held?.usable,
        "the actor's power to light",
      );
      return { actor, opponent };
    }

    /** The seat on the turn swaps its first private tile with Random Wild. */
    async function useWild(table: Awaited<ReturnType<typeof wildTable>>, actor: ClientRoom) {
      const rack = last<PrivateSeatState>(table.inboxOf(actor), GAME_EVENTS.privateState)!.rack;
      const target = rack[0]!;
      const use = { actionId: "use-1", handId: 1, powerUpId: "random_wild", tileId: target.id } as const;
      actor.send(GAME_MESSAGES.usePowerUp, use);
      const swap = await until(
        () => last<PrivatePowerSwap>(table.inboxOf(actor), GAME_EVENTS.powerSwap),
        "the swap",
      );
      return { use, target, swap };
    }

    it("deals each seat its own three offers, privately, and holds the turn until the draw closes", async () => {
      const table = await wildTable(4_990);

      for (const client of table.clients) {
        const inbox = table.inboxOf(client);
        const draws = ofType<PrivatePowerDraw>(inbox, GAME_EVENTS.powerDraw);
        assert.strictEqual(draws.length, 1, "one draw per seat, never another seat's");
        const [draw] = draws;
        const seat = table.room.state.seats.get(client.sessionId)!.seat;
        assert.strictEqual(draw!.handId, 1);
        assert.deepStrictEqual(draw!.offers, drawOffers(4_990, seat), "the engine's offers for this seat");
        assert.ok(draw!.deadline > draw!.now, "the room's clock runs the draw");

        const state = await until(
          () => last<PrivateSeatState>(inbox, GAME_EVENTS.privateState)?.power,
          "the draw in the private state",
        );
        assert.deepStrictEqual(state.draw, { offers: draw!.offers, picked: null, deadline: draw!.deadline });
        assert.strictEqual(state.held, null);
      }
      assert.strictEqual(table.room.state.toActSeat, -1, "nobody is on the clock during the draw");
      assert.strictEqual(table.room.state.turnDeadline, 0);
    });

    it("sends a Classic table no power messages at all", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Classic test",
        buyIn: 500,
        maxSeats: 2,
        seed: 4_990,
        tickMs: 5,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const inboxes = [listen(first), listen(second)];
      await readyUp(room, [first, second]);
      await until(
        () => inboxes.every((inbox) => (last<PrivateSeatState>(inbox, GAME_EVENTS.privateState)?.rack.length ?? 0) > 0),
        "both racks",
      );

      for (const inbox of inboxes) {
        assert.deepStrictEqual(
          inbox.map((message) => message.type).filter((type) => type !== GAME_EVENTS.privateState),
          [],
        );
        for (const state of ofType<PrivateSeatState>(inbox, GAME_EVENTS.privateState)) {
          assert.ok(!("power" in state), "a Classic seat's private state has no power field");
        }
      }
      assert.ok(room.state.toActSeat >= 0, "pre-flop starts on the deal");
    });

    it("lets both seats pick and the seat on the turn use Random Wild, telling the other only that it did", async () => {
      const table = await wildTable(4_991);
      const { actor, opponent } = await bothPickWild(table);
      const actorSeat = table.room.state.seats.get(actor.sessionId)!.seat;

      const opponentPower = last<PrivateSeatState>(table.inboxOf(opponent), GAME_EVENTS.privateState)!.power;
      assert.deepStrictEqual(opponentPower?.held, { powerUpId: "random_wild", used: false, usable: false });

      const { target, swap } = await useWild(table, actor);
      assert.deepStrictEqual(swap, {
        handId: 1,
        powerUpId: "random_wild",
        discardedTileId: target.id,
        tile: swap.tile,
      });
      assert.strictEqual(swap.tile.id, `power-${actorSeat}`);
      assert.ok(!("multiplier" in swap.tile), "the new tile is plain");

      const expected = { handId: 1, seat: actorSeat, powerUpId: "random_wild", street: "preflop" };
      for (const client of table.clients) {
        assert.deepStrictEqual(
          await until(() => last<PowerUsedEvent>(table.inboxOf(client), GAME_EVENTS.powerUsed), "powerUsed"),
          expected,
        );
      }

      const restocked = await until(
        () => {
          const state = last<PrivateSeatState>(table.inboxOf(actor), GAME_EVENTS.privateState);
          return state?.rack.some((tile) => tile.id === swap.tile.id) ? state : undefined;
        },
        "the new tile in the actor's rack",
      );
      assert.ok(!restocked.rack.some((tile) => tile.id === target.id), "the discarded tile is gone");
      assert.deepStrictEqual(restocked.power?.held, { powerUpId: "random_wild", used: true, usable: false });
      assert.deepStrictEqual(restocked.power?.swap, swap);
      assert.strictEqual(table.room.state.toActSeat, actorSeat, "using a power is not a betting action");

      // The opponent hears that a power was used, and nothing of what it gave or took.
      const heard = JSON.stringify(table.inboxOf(opponent)) + JSON.stringify(opponent.state);
      assert.ok(!heard.includes(swap.tile.id), "the opponent never sees the new tile");
      assert.ok(!heard.includes(target.id), "the opponent never sees the discarded tile");
      assert.strictEqual(ofType(table.inboxOf(opponent), GAME_EVENTS.powerSwap).length, 0);
    });

    it("answers a repeated actionId with the first result, never a second charge or roll", async () => {
      const table = await wildTable(4_991);
      const { actor, opponent } = await bothPickWild(table);
      const { use, swap } = await useWild(table, actor);
      await until(() => last(table.inboxOf(opponent), GAME_EVENTS.powerUsed), "the first powerUsed");

      actor.send(GAME_MESSAGES.usePowerUp, use);
      await until(() => ofType(table.inboxOf(actor), GAME_EVENTS.powerSwap).length === 2, "the replay");
      assert.deepStrictEqual(last(table.inboxOf(actor), GAME_EVENTS.powerSwap), swap, "the same swap");

      // A fresh id is a fresh gesture: the engine refuses it, because the power is spent.
      actor.send(GAME_MESSAGES.usePowerUp, { ...use, actionId: "use-2" });
      const refusal = await until(
        () => last<GameRejectionEvent>(table.inboxOf(actor), GAME_EVENTS.rejected),
        "the refusal",
      );
      assert.deepStrictEqual(refusal, { action: "usePowerUp", reason: "already-used", actionId: "use-2" });

      // A repeated pick replays too: no refusal for a pick that already landed.
      actor.send(GAME_MESSAGES.pickPower, {
        actionId: `pick-${actor.sessionId}`,
        handId: 1,
        powerUpId: "random_wild",
      });
      // A command for a hand that is not this one is refused rather than landing on it.
      actor.send(GAME_MESSAGES.pickPower, { actionId: "stale", handId: 2, powerUpId: "mulligan" });
      await until(
        () => actionIdOf(last<GameRejectionEvent>(table.inboxOf(actor), GAME_EVENTS.rejected)) === "stale",
        "the stale refusal",
      );
      const refusals = ofType<GameRejectionEvent>(table.inboxOf(actor), GAME_EVENTS.rejected);
      assert.deepStrictEqual(refusals.map(actionIdOf), ["use-2", "stale"]);
      assert.strictEqual(ofType(table.inboxOf(opponent), GAME_EVENTS.powerUsed).length, 1, "one broadcast");
    });

    it("rolls the same offers and the same letter from the same seed", async () => {
      const rolls: { offers: unknown[]; letter: string }[] = [];
      for (let run = 0; run < 2; run += 1) {
        const table = await wildTable(4_992);
        const offers = table.clients.map((client) => ({
          seat: table.room.state.seats.get(client.sessionId)!.seat,
          offers: last<PrivatePowerDraw>(table.inboxOf(client), GAME_EVENTS.powerDraw)!.offers,
        }));
        offers.sort((a, b) => a.seat - b.seat);
        const { actor } = await bothPickWild(table);
        const { swap } = await useWild(table, actor);
        rolls.push({ offers, letter: swap.tile.letter });
        await colyseus.cleanup();
        colyseus.sdk.auth.token = "test-session";
      }
      assert.deepStrictEqual(rolls[0], rolls[1]);
    });

    it("restores the owner's held power and new tile on reconnect", async () => {
      const table = await wildTable(4_991, { reconnectSeconds: 2 });
      const { actor } = await bothPickWild(table);
      const { swap } = await useWild(table, actor);

      actor.reconnection.minUptime = 0;
      actor.reconnection.minDelay = 1;
      actor.reconnection.maxDelay = 5;
      actor.reconnection.backoff = () => 1;
      let reconnected = false;
      actor.onReconnect.once(() => {
        reconnected = true;
      });
      const inbox = table.inboxOf(actor);
      const before = inbox.length;
      actor.connection.close();

      const restored = await until(
        () =>
          reconnected &&
          inbox
            .slice(before)
            .filter((message) => message.type === GAME_EVENTS.privateState)
            .map((message) => message.payload as PrivateSeatState)
            .at(-1),
        "the restored private state",
      );
      assert.deepStrictEqual(restored.power?.held, { powerUpId: "random_wild", used: true, usable: false });
      assert.deepStrictEqual(restored.power?.swap, swap);
      assert.ok(restored.rack.some((tile) => tile.id === swap.tile.id), "the new tile is back in the rack");
    });

    it("closes the draw on the room's clock, each seat keeping its first offer", async function (this: Mocha.Context) {
      this.timeout(20_000);
      const table = await wildTable(4_993);

      await until(() => table.room.state.toActSeat >= 0, "the draw's clock to run out", 15_000);
      for (const client of table.clients) {
        const inbox = table.inboxOf(client);
        const [first] = last<PrivatePowerDraw>(inbox, GAME_EVENTS.powerDraw)!.offers;
        const held = await until(
          () => last<PrivateSeatState>(inbox, GAME_EVENTS.privateState)?.power?.held ?? undefined,
          "the kept power",
        );
        assert.strictEqual(held.powerUpId, first);
        assert.strictEqual(last<PrivateSeatState>(inbox, GAME_EVENTS.privateState)?.power?.draw, null);
      }
    });
  });
});
