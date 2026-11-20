/**
 * Finds seeds for the offline-hand smoke (.maestro/offline-hand.yaml and its native copy).
 *
 * Run: pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-offline-hand.ts [firstSeed] [count]
 *
 * It plays the flows' hero script against the app's bots: call (or check) once on each street to
 * the river, open the river for the big blind, and call one raise. A seed is kept only when that
 * script fits the deal exactly, and when the hero can tap out a dictionary word: the strip prints
 * the hero's tiles then the board's, and a tap plays a tile where it lies, so the word is an
 * in-order run of single-letter tiles. Each kept seed prints the line the flows assert.
 */
import assert from "node:assert/strict";

import type { OfflineAction, Tile } from "@wordpoker/contracts";
import { decideBotWord, decideOfflineMove } from "../src/bot/bot";
import { DEFAULT_STAKES } from "../src/money/betting";
import { loadDictionary } from "../src/words/dictionary";
import { availableTiles, reduce, startHand, type OfflineState } from "../src/table/offline";

const firstSeed = Number(process.argv[2] ?? 1);
const count = Number(process.argv[3] ?? 2000);
assert.ok(Number.isSafeInteger(firstSeed) && Number.isSafeInteger(count) && count > 0);
const dictionary = await loadDictionary();
const HERO = "hero";

/** The longest dictionary word the hero can tap: in strip order, single-letter tiles only. */
function tappableWord(tiles: readonly Tile[]): Tile[] | null {
  const plain = tiles.filter((tile) => /^[A-Z]$/.test(tile.letter) && !("alternativeLetter" in tile));
  let best: Tile[] | null = null;
  for (let mask = 1; mask < 1 << plain.length; mask += 1) {
    const pick = plain.filter((_, index) => mask & (1 << index));
    if (pick.length < 3 || (best !== null && pick.length <= best.length)) continue;
    if (dictionary.isWord(pick.map((tile) => tile.letter).join(""))) best = pick;
  }
  return best;
}

const pot = (state: OfflineState) => state.seats.reduce((sum, seat) => sum + seat.committedHand, 0);

for (let seed = firstSeed; seed < firstSeed + count; seed += 1) {
  let state = startHand({
    seed, players: [HERO, "ellis", "jay", "mira"], nowMs: 0, dictionary,
    stakes: { ...DEFAULT_STAKES }, restack: true, turnDurationMs: 300_000,
  });
  const heroActs: string[] = [];
  let riverBet = false;
  let word: Tile[] | null = null;
  let fits = true;
  for (let step = 0; state.phase !== "payout" && fits; step += 1) {
    assert.ok(step < 250, `seed ${seed} did not terminate`);
    let action: OfflineAction | null = null;
    if (state.wordWindow?.status === "open") {
      const heroSlot = state.wordWindow.slots.find((slot) => slot.playerId === HERO);
      if (heroSlot?.status === "drafting") {
        word = tappableWord(availableTiles(state, heroSlot.seat));
        if (word === null) { fits = false; break; }
        action = { type: "confirmWord", playerId: HERO, submission: { plays: word.map((tile) => ({ tileId: tile.id })) } };
      } else {
        const slot = state.wordWindow.slots.find((slot) => slot.status === "drafting");
        const submission = slot === undefined ? null : decideBotWord(state, slot.seat);
        action = slot !== undefined && submission !== null
          ? { type: "confirmWord", playerId: slot.playerId, submission }
          : { type: "timeoutWords" };
      }
    } else {
      const seat = state.seats[state.toActIndex ?? -1];
      assert.ok(seat);
      if (seat.id === HERO) {
        const owed = (state.betting?.currentBet ?? 0) - seat.committedRound;
        const opens: boolean = state.phase === "river" && !riverBet && owed === 0;
        riverBet ||= opens;
        const heroAction: OfflineAction = opens
          ? { type: "bet", playerId: HERO, amount: DEFAULT_STAKES.bigBlind }
          : { type: owed > 0 ? "call" : "check", playerId: HERO };
        heroActs.push(`${state.phase}:${heroAction.type}${owed > 0 ? ` ${owed}` : ""}@pot ${pot(state)}`);
        action = heroAction;
      } else action = decideOfflineMove(state, seat.id);
    }
    assert.ok(action, "every beat produces an action");
    state = reduce(state, action, 0);
  }
  if (process.env.PROBE_DEBUG) console.error(seed, heroActs, pot(state), word?.map((tile) => tile.letter).join(""));
  const shape = heroActs.map((act) => act.split(/[: @]/)[0] + ":" + act.split(":")[1]?.split(" ")[0]);
  // The flows' shape: once on each street before the river, then open the river and call a raise.
  const expected = ["preflop:call", "flop", "turn", "river:bet", "river:call"];
  fits = fits && word !== null && shape.length === 5 && shape.every((act, index) =>
    act.startsWith(expected[index]!) && (index !== 1 && index !== 2 || /:(call|check)$/.test(act)));
  if (!fits) continue;
  const standings = state.result?.standings ?? [];
  const hero = standings.find((row) => row.playerId === HERO);
  const folds = state.seats.filter((seat) => seat.folded).length;
  const words = standings.filter((row) => row.score > 0).length;
  console.log(JSON.stringify({
    seed, heroActs, finalPot: pot(state),
    word: word!.map((tile) => tile.letter).join(""), tiles: word!.map((tile) => tile.id), score: hero?.score, place: hero?.place,
    summary: `${state.seats.length} PLAYERS · ${folds} FOLD${folds === 1 ? "" : "S"} · ${words} WORD${words === 1 ? "" : "S"} PLAYED`,
    strip: availableTiles(state, 0).map((tile) => `${tile.id}`),
  }));
}
