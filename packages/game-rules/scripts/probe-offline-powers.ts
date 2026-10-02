/** Run: pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-offline-powers.ts [firstSeed] [hands] */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import type { OfflineAction } from "@wordpoker/contracts";
import { chooseBotPower, decideBotPowerUse } from "../src/bot/bot-power";
import { chooseOfflineWord, decideOfflineMove } from "../src/bot/bot";
import { loadDictionary } from "../src/words/dictionary";
import { availableTiles, canUsePower, reduce, startHand } from "../src/table/offline";

const firstSeed = Number(process.argv[2] ?? 20260919);
const hands = Number(process.argv[3] ?? 1);
assert.ok(Number.isSafeInteger(firstSeed) && Number.isSafeInteger(hands) && hands > 0 && hands <= 1024);
const dictionary = await loadDictionary();
const pickMs: number[] = [];
const useMs: number[] = [];
for (let seed = firstSeed; seed < firstSeed + hands; seed += 1) {
  let now = 0;
  let state = startHand({ seed, players: ["hero", "ellis", "jay", "mira"], nowMs: now,
    dictionary, powerUps: { deal: "choose3" } });
  const trace: unknown[] = [];
  for (let step = 0; state.phase !== "payout"; step += 1) {
    assert.ok(step < 250, `seed ${seed} did not terminate`);
    now += 900;
    let action: OfflineAction | null = null;
    const useFor = (id: string) => {
      const start = performance.now();
      const use = decideBotPowerUse(state, id, now);
      useMs.push(performance.now() - start);
      return use === null ? null : { type: "usePowerUp" as const, playerId: id, ...use };
    };
    if (now >= state.endsAtMs) {
      action = { type: state.powers?.draw.status === "open" ? "timeoutPowerDraw" :
        state.wordWindow?.status === "open" ? "timeoutWords" : "timeoutTurn" };
    } else if (state.powers?.draw.status === "open") {
      const slot = state.powers.draw.slots.find((slot) => slot.picked === null);
      assert.ok(slot);
      const start = performance.now();
      const powerUpId = slot.playerId === "hero" ? "vowel_magnet" : chooseBotPower(state, slot.playerId);
      if (slot.playerId !== "hero") pickMs.push(performance.now() - start);
      action = { type: "pickPower", playerId: slot.playerId, powerUpId };
    } else if (state.wordWindow?.status === "open") {
      for (const slot of state.wordWindow.slots) {
        if (slot.status !== "drafting") continue;
        action = slot.playerId === "hero" ? null : useFor(slot.playerId);
        if (action !== null) break;
        const submission = chooseOfflineWord({ available: availableTiles(state, slot.seat), dictionary });
        if (submission !== null) { action = { type: "confirmWord", playerId: slot.playerId, submission }; break; }
      }
      if (action === null) { now = state.endsAtMs; action = { type: "timeoutWords" }; }
    } else {
      const seat = state.seats[state.toActIndex ?? -1];
      assert.ok(seat);
      if (seat.id === "hero") {
        const held = state.powers?.held.hero;
        const target = seat.privateTiles[1];
        action = held !== undefined && target !== undefined && canUsePower(state, seat.id, now)
          ? { type: "usePowerUp", playerId: seat.id, powerUpId: held.id, tileId: target.id }
          : { type: (state.betting?.currentBet ?? 0) > seat.committedRound ? "call" : "check", playerId: seat.id };
      } else action = useFor(seat.id) ?? decideOfflineMove(state, seat.id);
    }
    assert.ok(action, "every live beat produces an action or settles a deadline");
    if (action.type === "usePowerUp") assert.ok(canUsePower(state, action.playerId, now));
    const before = state;
    state = reduce(state, action, now);
    const slot = "playerId" in action ? state.wordWindow?.slots.find((slot) => slot.playerId === action.playerId) : undefined;
    trace.push({ phase: before.phase, now, action,
      word: slot?.status === "confirmed" ? state.result?.standings.find((row) => row.playerId === slot.playerId)?.word : undefined,
      pot: state.seats.reduce((sum, seat) => sum + seat.committedHand, 0),
    });
  }
  console.log(JSON.stringify({ seed, trace, standings: state.result?.standings }));
}
function latency(values: number[]) {
  values.sort((a, b) => a - b);
  const at = (p: number) => Number((values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0).toFixed(3));
  return { samples: values.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
}
console.log(JSON.stringify({ picks: latency(pickMs), uses: latency(useMs) }));
