import assert from "assert";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import {
  GAME_EVENTS,
  GAME_MESSAGES,
  WAITING_PHASE,
  type GameRejectionEvent,
  type PrivateSeatState,
} from "@wordpoker/contracts";

import appConfig from "../src/app.config.js";

// The room draws its deal seed server-side; the explicit `seed` option is honored only behind
// this gate. The suite boots unseeded rooms too, so only tests that pin a seed need it on.
process.env.WORDPOKER_DETERMINISTIC_SEED = "1";

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

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  describe("authoritative hand", () => {
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
      assert.strictEqual(room.state.phase, "preflop", "a full table deals the first round");
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

      actor.send(GAME_MESSAGES.betting, { type: "check" });
      await room.waitForNextPatch();
      assert.strictEqual(privateStates.size, 2, "each connection receives its private state");
      for (const client of clients) {
        const received = privateStates.get(client.sessionId);
        assert.ok(received, "every connection received its own private state");
        assert.strictEqual(received.playerId, client.sessionId, "the state is the receiving seat's");
        assert.strictEqual(received.seat, room.state.seats.get(client.sessionId)?.seat);
        assert.strictEqual(received.rack.length, 2);
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
        currentActor.send(GAME_MESSAGES.betting, { type: "check" });
        await room.waitForNextPatch();
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
      assert.strictEqual(room.state.result.available, true);
      assert.ok(room.state.result.standings.length > 0);
    });

    it("folds a disconnected actor instead of pausing the hand", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Disconnect test",
        buyIn: 500,
        maxSeats: 2,
        seed: 456,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "preflop", "full table starts");

      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      assert.ok(actorId, "the disconnecting seat has an id");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);
      await actor.leave();
      await room.waitForNextPatch();
      assert.strictEqual(room.state.seats.get(actorId)?.hasFolded, true);
      assert.notStrictEqual(room.state.phase, "waiting", "a missing actor does not pause the hand");
    });

    it("folds a seat dropped on its own turn once the tick reaches its deadline (§29)", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Drop at deadline",
        buyIn: 500,
        maxSeats: 2,
        seed: 654,
        turnDuration: 30,
        tickMs: 5,
        payoutDelay: 10,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "preflop", "full table starts");

      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === room.state.toActSeat)?.playerId;
      assert.ok(actorId, "the server chooses the first actor");
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actor);

      // Drop the connection for real — no consented leave: the seat stays held for reconnection
      // while the room's tick reaches its deadline, which is where the fold used to throw.
      actor.reconnection.enabled = false;
      actor.connection.close();

      for (let tick = 0; tick < 40 && room.state.seats.get(actorId)?.hasFolded !== true; tick += 1) {
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

      const playerForSeat = (seatNumber: number) =>
        [...room.state.seats.values()].find((seat) => seat.seat === seatNumber)?.playerId;
      const clientForPlayer = (playerId: string) =>
        [first, second].find((client) => client.sessionId === playerId);

      // Make one legal move so both private snapshots have arrived before the test starts
      // comparing state. The first seat is deliberately the one that reconnects below.
      const openingActorId = playerForSeat(room.state.toActSeat);
      assert.ok(openingActorId);
      clientForPlayer(openingActorId)?.send(GAME_MESSAGES.betting, { type: "check" });
      await room.waitForNextPatch();

      const beforeWord = privateStates.get(first.sessionId);
      assert.ok(beforeWord && beforeWord.rack.length > 0, "the reconnecting seat has a rack");
      const rackIds = beforeWord.rack.map((tile) => tile.id);

      for (let action = 0; action < 20 && room.state.wordWindow.status !== "open"; action += 1) {
        const actorId = playerForSeat(room.state.toActSeat);
        assert.ok(actorId, "the server has an actor");
        clientForPlayer(actorId)?.send(GAME_MESSAGES.betting, { type: "check" });
        await room.waitForNextPatch();
      }
      assert.strictEqual(room.state.wordWindow.status, "open", "the hand reaches the word window");

      const draftTile = beforeWord.rack.find((tile) => !("sequenceLetter" in tile));
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

    it("auto-checks an idle actor at the configured turn deadline", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Timeout test",
        buyIn: 500,
        maxSeats: 2,
        seed: 789,
        turnDuration: 20,
        tickMs: 5,
      });
      const first = await colyseus.connectTo(room);
      const second = await colyseus.connectTo(room);
      const actorSeat = room.state.toActSeat;
      const actorId = [...room.state.seats.values()].find((seat) => seat.seat === actorSeat)?.playerId;
      const actor = [first, second].find((client) => client.sessionId === actorId);
      assert.ok(actorId && actor);

      const timeout = new Promise<GameRejectionEvent>((resolve) => {
        actor.onMessage(GAME_EVENTS.rejected, (payload) => resolve(payload as GameRejectionEvent));
      });
      for (let tick = 0; tick < 10 && room.state.toActSeat === actorSeat; tick += 1) {
        await room.waitForNextTimestep();
      }

      assert.notStrictEqual(room.state.toActSeat, actorSeat, "the server advances after the deadline");
      assert.deepStrictEqual(await timeout, { action: "betting", reason: "turn-timeout" });
      assert.equal(room.state.seats.get(actorId)?.hasFolded, false, "nothing owed auto-checks");
      assert.ok(room.state.turnDeadline > room.state.now, "the next actor has a fresh deadline");
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

      // The next rollover finds one seat with all the chips: no hand is dealt, and the room
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
          await colyseus.connectTo(room);
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
  });

  describe("create options", () => {
    it("takes the config the create named", async () => {
      const room = await colyseus.createRoom("game", {
        name: "High Stakes",
        buyIn: 50_000,
        maxSeats: 6,
      });

      assert.strictEqual(room.maxClients, 6, "the seat cap is the room's own");
      assert.strictEqual(room.state.table.name, "High Stakes");
      assert.strictEqual(room.state.table.buyIn, 50_000);
      assert.strictEqual(room.state.table.minBet, 1_000, "ADR 0001: 2% of the buy-in");
      assert.strictEqual(room.state.table.maxSeats, 6);
    });

    it("publishes the config as the room's matchmaking metadata", async () => {
      const room = await colyseus.createRoom("game", { name: "Beginner", buyIn: 500, maxSeats: 2 });

      assert.deepStrictEqual(room.metadata, {
        name: "Beginner",
        buyIn: 500,
        minBet: 10,
        maxSeats: 2,
        status: "waiting",
      });
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
      ["more than six seats", { name: "Table", buyIn: 500, maxSeats: 7 }],
      ["a fractional seat count", { name: "Table", buyIn: 500, maxSeats: 3.5 }],
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
        (error: Error) => /whole number from 2 to 6/.test(error.message),
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
      const lobby = await colyseus.sdk.joinOrCreate("lobby");
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
        minBet: 100,
        maxSeats: 3,
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

      await colyseus.connectTo(table);
      await colyseus.connectTo(table);

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
      await colyseus.connectTo(table);
      await followed.until((rows) => rows.get(table.roomId)!.locked === true, "the table to lock");

      await first.leave();
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
});
