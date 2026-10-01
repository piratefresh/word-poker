/** Run: pnpm --filter @wordpoker/game-rules exec tsx scripts/benchmark-bots.ts [firstSeed] [hands] */
import assert from "node:assert/strict";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";

import { chooseOfflineWord, decideOfflineMove } from "../src/bot/bot";
import { botProfile } from "../src/bot/bot-profile";
import { loadDictionary } from "../src/words/dictionary";
import { availableTiles, reduce, startHand } from "../src/table/offline";

const firstSeed = Number(process.argv[2] ?? 10_000);
const hands = Number(process.argv[3] ?? 128);
assert.ok(Number.isSafeInteger(firstSeed) && Number.isSafeInteger(hands) && hands > 0);
const dictionary = await loadDictionary();
const durations: number[] = [];
const wordDurations: number[] = [];
const actions: Record<string, Record<string, number>> = {};
let foldOuts = 0;
let allIns = 0;
let totalPot = 0;
for (let seed = firstSeed; seed < firstSeed + hands; seed += 1) {
  let state = startHand({ seed, players: ["hero", "ellis", "jay", "mira"], nowMs: 0, dictionary });
  let moves = 0;
  while (state.phase !== "payout") {
    assert.ok(++moves < 160, `hand ${seed} did not terminate`);
    if (state.wordWindow?.status === "open") {
      for (const slot of state.wordWindow.slots) {
        if (state.wordWindow?.status !== "open") break;
        const start = performance.now();
        const submission = chooseOfflineWord({ available: availableTiles(state, slot.seat), dictionary });
        wordDurations.push(performance.now() - start);
        if (submission) state = reduce(state, { type: "confirmWord", playerId: slot.playerId, submission }, 0);
      }
      if (state.wordWindow?.status === "open") state = reduce(state, { type: "timeoutWords" }, state.endsAtMs);
      continue;
    }
    const seat = state.toActIndex;
    const actor = seat === null ? undefined : state.seats[seat];
    assert.ok(seat !== null && actor);
    const start = performance.now();
    const action = decideOfflineMove(state, actor.id);
    durations.push(performance.now() - start);
    const name = botProfile(seat).name;
    const counts = actions[name] ?? (actions[name] = {});
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    state = reduce(state, action, 0);
  }
  if (state.result?.standings.length === 0) foldOuts += 1;
  if (state.seats.some((seat) => seat.allIn)) allIns += 1;
  totalPot += state.seats.reduce((sum, seat) => sum + seat.committedHand, 0);
  assert.equal(state.seats.reduce((sum, seat) => sum + seat.stack, 0), 4_000);
}
function latency(values: number[]) {
  values.sort((a, b) => a - b);
  const at = (p: number) => Number((values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0).toFixed(3));
  return { samples: values.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
}
console.log(JSON.stringify({
  runtime: process.version, platform: process.platform, cpu: cpus()[0]?.model,
  firstSeed, hands, foldOuts, allIns, meanPot: Math.round(totalPot / hands), actions,
  decisions: latency(durations), words: latency(wordDurations),
}, null, 2));
