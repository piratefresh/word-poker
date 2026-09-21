import assert from "assert";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import { WAITING_PHASE } from "@wordpoker/contracts";

import appConfig from "../src/app.config.js";

/**
 * The server, booted once: what a creator may configure, what the round clock does with a full
 * table, and what the lobby sees of the result.
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

  describe("round clock", () => {
    it("waits for a full table, then runs the clock through the phases", async () => {
      // A short round so the phases tick over within the test's timeout.
      const room = await colyseus.createRoom("game", {
        name: "Clock test",
        buyIn: 500,
        maxSeats: 2,
        roundDuration: 60,
      });
      assert.strictEqual(room.state.phase, "waiting", "empty room is waiting");

      await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "waiting", "one player is not a table");

      await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "preflop", "a full table deals the first round");
      assert.ok(room.state.roundDeadline > 0, "the round is counting down");
      assert.strictEqual(room.state.handCount, 1);

      await new Promise((resolve) => setTimeout(resolve, 90));
      assert.notStrictEqual(room.state.phase, "preflop", "the clock advances the round");
      assert.notStrictEqual(room.state.phase, "waiting", "the table is still mid-hand");
      assert.strictEqual(room.state.handCount, 1, "the cycle has not wrapped into a new hand");
    });

    it("pauses the clock when the table drops below full", async () => {
      const room = await colyseus.createRoom("game", {
        name: "Clock test",
        buyIn: 500,
        maxSeats: 2,
        roundDuration: 1_000,
      });
      await colyseus.connectTo(room);
      const client2 = await colyseus.connectTo(room);
      assert.strictEqual(room.state.phase, "preflop", "full table starts");

      await client2.leave();
      await room.waitForNextPatch();
      assert.strictEqual(room.state.phase, "waiting", "an empty seat stops the round");
      assert.strictEqual(room.state.roundDeadline, 0, "the deadline is cleared");
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
      assert.strictEqual(room.state.name, "High Stakes");
      assert.strictEqual(room.state.buyIn, 50_000);
      assert.strictEqual(room.state.minBet, 1_000, "ADR 0001: 2% of the buy-in");
      assert.strictEqual(room.state.maxSeats, 6);
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

      assert.strictEqual(room.state.name, "Sunset");
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

    it("unlocks the table again when a seat frees", async () => {
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
      assert.strictEqual(reopened.metadata!.status, WAITING_PHASE, "an empty seat stops the hand");
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
