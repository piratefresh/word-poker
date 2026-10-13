import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadDictionary, verifyHandRecord } from "@wordpoker/game-rules";
import { isHandRecord, type HandRecord } from "@wordpoker/contracts";
import { AuthoritativeGame } from "../src/rooms/AuthoritativeGame.js";

// Drive the same transition seam as all room messages and timers, then replay its actual record.
describe("authoritative history capture", () => {
  it("captures fold, disconnect, turn timeout, and later showdowns once with replayable inputs", async () => {
    const dictionary = await loadDictionary("en_US-large");
    const records: HandRecord[] = [];
    const sessionId = randomUUID();
    const game = new AuthoritativeGame({
      seed: 123,
      dictionary,
      blinds: { smallBlind: 5, bigBlind: 10 },
      turnDurationMs: 60_000,
      powerUps: { deal: "off" },
      onSettled: (settled) => records.push(game.handRecord(settled, {
        sessionId, tableName: "Sunset", userIdFor: (playerId) => `account-${playerId}`,
      })),
    });
    let now = 1_000_000;
    game.start([{ playerId: "a", stack: 1_000 }, { playerId: "b", stack: 1_000 }], now, 0);
    for (let hand = 1; hand <= 5; hand += 1) {
      const initial = game.state;
      assert.ok(initial && initial.toActIndex !== null);
      const actor = initial.seats[initial.toActIndex].id;
      if (hand === 1) game.dispatch({ type: "fold", playerId: actor }, ++now);
      else if (hand === 2) game.foldDepartedSeat(actor, ++now);
      else if (hand === 3) { now = initial.endsAtMs; game.timeoutTurn(now); }
      else {
        for (let step = 0; step < 20 && game.state?.betting !== null; step += 1) {
          const state = game.state;
          assert.ok(state && state.betting && state.toActIndex !== null);
          const seat = state.seats[state.toActIndex];
          game.dispatch({
            type: seat.committedRound < state.betting.currentBet ? "call" : "check",
            playerId: seat.id,
          }, ++now);
        }
        const state = game.state;
        assert.equal(state?.wordWindow?.status, "open");
        assert.ok(state);
        now = state.endsAtMs;
        game.timeoutWords(now);
      }
      assert.equal(records.length, hand);
      const record = records[hand - 1];
      assert.ok(isHandRecord(record));
      const replay = verifyHandRecord(record, dictionary);
      assert.ok(replay.ok, JSON.stringify(replay));
      assert.equal(record.handNo, hand);
      assert.equal(record.config.tableName, "Sunset");
      assert.ok(record.seats.every((seat) => seat.userId === `account-${seat.playerId}`));
      assert.equal(record.actions.at(-1)?.source, hand === 2 ? "disconnect" : hand >= 3 ? "timeout" : "player");
      assert.equal(record.summary.outcome, hand >= 4 ? "showdown" : "fold-out");
      game.foldDepartedSeat(actor, ++now); // A repeated departure at payout cannot report twice.
      assert.equal(records.length, hand);
      if (hand < 5) game.dealNext(++now);
    }
  });
});
