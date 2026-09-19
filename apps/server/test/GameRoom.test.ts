import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { GameRoomState } from "../src/rooms/schema/GameRoomState.js";

describe("GameRoom round clock", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("waits for a full table, then runs the clock through the phases", async () => {
    // A short round so the phases tick over within the test's timeout.
    const room = await colyseus.createRoom<GameRoomState>("game", { roundDuration: 60 });
    assert.strictEqual(room.state.phase, "waiting", "empty room is waiting");

    await colyseus.connectTo(room);
    assert.strictEqual(room.state.phase, "waiting", "one player is not a table");

    await colyseus.connectTo(room);
    assert.strictEqual(room.state.phase, "preflop", "a full table deals the first round");
    assert.ok(room.state.roundDeadline > 0, "the round is counting down");
    assert.strictEqual(room.state.handCount, 1);

    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.strictEqual(room.state.phase, "flop", "the clock advances the round");
  });

  it("pauses the clock when the table drops below full", async () => {
    const room = await colyseus.createRoom<GameRoomState>("game", { roundDuration: 1_000 });
    await colyseus.connectTo(room);
    const client2 = await colyseus.connectTo(room);
    assert.strictEqual(room.state.phase, "preflop", "full table starts");

    await client2.leave();
    await room.waitForNextPatch();
    assert.strictEqual(room.state.phase, "waiting", "an empty seat stops the round");
    assert.strictEqual(room.state.roundDeadline, 0, "the deadline is cleared");
  });
});
