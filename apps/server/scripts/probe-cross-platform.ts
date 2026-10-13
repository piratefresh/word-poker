/** Recheck the two UI players' seed, tile selectors, scores and payout: pnpm smoke:cross:probe. */
import assert from "node:assert/strict";
import { blindsFor } from "@wordpoker/contracts";
import { loadDictionary } from "@wordpoker/game-rules";
import { AuthoritativeGame } from "../src/rooms/AuthoritativeGame.js";
import { bestStripWord } from "./four-seat-scenario.js";

const dictionary = await loadDictionary();
const game = new AuthoritativeGame({
  seed: 505,
  dictionary,
  blinds: blindsFor(500),
  turnDurationMs: 300_000,
  powerUps: { deal: "off" },
});
game.start([{ playerId: "web", stack: 500 }, { playerId: "native", stack: 500 }], 0);
let now = 0;
const turns: string[] = [];
while (game.state?.wordWindow?.status !== "open") {
  const state = game.state;
  assert.ok(state);
  assert.notEqual(state.toActIndex, null);
  const seat = state.seats[state.toActIndex ?? -1];
  assert.ok(seat);
  assert.ok(state.betting);
  const type = state.betting.currentBet > seat.committedRound ? "call" : "check";
  turns.push(`${state.phase}: ${seat.id} ${type}`);
  game.dispatch({ type, playerId: seat.id }, ++now);
}
const state = game.state;
assert.ok(state);
assert.deepEqual(turns, [
  "preflop: web call", "preflop: native check",
  "flop: native check", "flop: web check",
  "turn: native check", "turn: web check",
  "river: native check", "river: web check",
]);
assert.deepEqual(state.community.map((tile) => tile.id), ["E-12", "AE-1", "T-1", "A-4", "L-2"]);
for (const seat of state.seats) {
  const word = bestStripWord([...seat.privateTiles, ...state.community], dictionary);
  assert.ok(word);
  assert.equal(word.word, seat.id === "web" ? "JET" : "ETA");
  assert.equal(word.score, seat.id === "web" ? 15 : 8);
  assert.deepEqual(word.submission.plays, (seat.id === "web" ? ["J-1", "E-12", "T-1"] : ["E-12", "T-1", "A-4"])
    .map((tileId) => ({ tileId })));
  console.log(`${seat.id}: ${word.word} (${word.score} points), taps ${word.submission.plays.map((play) => play.tileId).join(", ")}`);
  game.dispatch({ type: "confirmWord", playerId: seat.id, submission: word.submission }, ++now);
}
const paid = game.state;
assert.ok(paid);
assert.equal(paid.phase, "payout");
assert.ok(paid.result);
assert.equal(paid.result.winner, "web");
assert.deepEqual(paid.result.payout.pots.map((pot) => pot.amount), [20]);
assert.deepEqual(paid.seats.map((seat) => seat.stack), [510, 490]);
console.log("Seed 505 passed: web wins the $20 pot; stacks 510 / 490.");
