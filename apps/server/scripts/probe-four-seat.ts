/**
 * Finds a seed for the four-browser smoke (STO-483) and prints what each seat taps.
 *
 * Replays `FOUR_SEAT_SCRIPT` against the room's own engine adapter, no sockets, for each
 * candidate seed, and keeps the first one where every scripted action is legal and the session
 * turns out as the script says: P2 wins hand 1, hand 2 builds a side pot and P3 busts on it,
 * and hand 3 deals with P3 sitting out. Each seat plays the best word its strip spells by taps
 * alone (`bestStripWord`). Usage, from the repo root:
 *
 *   pnpm --filter @wordpoker/server exec tsx scripts/probe-four-seat.ts [firstSeed] [lastSeed]
 *
 * With no range it checks the pinned `FOUR_SEAT_SEED` alone, which is how to see its taps again.
 */

import { blindsFor, type Tile } from "@wordpoker/contracts";
import { loadDictionary, type Dictionary } from "@wordpoker/game-rules";

import { AuthoritativeGame } from "../src/rooms/AuthoritativeGame.js";
import {
  FOUR_SEAT_BUY_IN,
  FOUR_SEAT_SCRIPT,
  FOUR_SEAT_SEED,
  bestStripWord,
  toEngineAction,
  type StripWord,
} from "./four-seat-scenario.js";

const PLAYERS = ["p1", "p2", "p3", "p4"];

export interface HandTrace {
  readonly racks: readonly (readonly Tile[])[];
  readonly board: readonly Tile[];
  readonly words: ReadonlyMap<number, StripWord>;
  readonly stacks: readonly number[];
  readonly pots: readonly number[];
  readonly winnerSeat: number;
}

/** Plays the script under one seed; the trace, or why the seed does not fit. */
export function playFourSeatSession(seed: number, dictionary: Dictionary): HandTrace[] | string {
  const game = new AuthoritativeGame({
    seed,
    dictionary,
    blinds: blindsFor(FOUR_SEAT_BUY_IN),
    turnDurationMs: 120_000,
    powerUps: { deal: "off" },
  });
  let now = 0;
  game.start(
    PLAYERS.map((playerId) => ({ playerId, stack: FOUR_SEAT_BUY_IN })),
    now,
    0,
  );
  const traces: HandTrace[] = [];

  for (const [handIndex, hand] of FOUR_SEAT_SCRIPT.entries()) {
    if (handIndex > 0) game.dealNext((now += 1));
    let state = game.state!;
    const racks = state.seats.map((seat) => seat.privateTiles);
    if (handIndex === 2 && !state.seats[2]!.sittingOut) return "hand 3: P3 is dealt in";

    for (const scripted of hand.steps) {
      state = game.state!;
      if (state.toActIndex !== scripted.seat) {
        return `hand ${handIndex + 1}: seat ${state.toActIndex} is to act, script says ${scripted.seat} ${scripted.action}`;
      }
      try {
        game.dispatch(toEngineAction(state, scripted), (now += 1));
      } catch (error) {
        return `hand ${handIndex + 1}: seat ${scripted.seat} ${scripted.action}: ${(error as Error).message}`;
      }
    }
    state = game.state!;
    if (state.wordWindow?.status !== "open") return `hand ${handIndex + 1}: the word window did not open`;

    const board = state.community;
    const words = new Map<number, StripWord>();
    for (const seat of hand.words) {
      const word = bestStripWord([...racks[seat]!, ...board], dictionary);
      if (word === null) return `hand ${handIndex + 1}: seat ${seat} spells no word by taps`;
      words.set(seat, word);
      game.dispatch(
        { type: "confirmWord", playerId: PLAYERS[seat]!, submission: word.submission },
        (now += 1),
      );
    }
    state = game.state!;
    if (state.phase !== "payout" || state.result === null) return `hand ${handIndex + 1}: no payout`;
    const scores = [...words.values()].map((word) => word.score);
    if (new Set(scores).size !== scores.length) return `hand ${handIndex + 1}: tied scores`;

    traces.push({
      racks,
      board,
      words,
      stacks: state.seats.map((seat) => seat.stack),
      pots: state.result.payout.pots.map((pot) => pot.amount),
      winnerSeat: PLAYERS.indexOf(state.result.winner),
    });
  }

  const [first, second] = traces;
  if (first!.winnerSeat !== 1) return "hand 1: P2 does not win";
  if (second!.pots.length < 2) return "hand 2: no side pot";
  if (second!.stacks[2] !== 0) return "hand 2: P3 does not bust";
  return traces;
}

/** How a tile reads, for the header of a flow. */
function describe(tile: Tile): string {
  return "alternativeLetter" in tile ? `${tile.letter}/${tile.alternativeLetter}` : tile.letter;
}

function print(seed: number, traces: readonly HandTrace[]) {
  console.log(`seed ${seed}`);
  for (const [handIndex, trace] of traces.entries()) {
    console.log(`\nhand ${handIndex + 1}: board ${trace.board.map(describe).join(" ")}`);
    for (const [seat, rack] of trace.racks.entries()) {
      const word = trace.words.get(seat);
      console.log(`  P${seat + 1} rack ${rack.map(describe).join(" ")}${word ? ` -> ${word.word} (${word.score})` : ""}`);
      for (const play of word?.plays ?? []) {
        console.log(`      tap word-builder-tile-${play.tile.id}${play.face ? `, face word-builder-face-${play.tile.id}-${play.face}` : ""}`);
      }
    }
    console.log(`  winner P${trace.winnerSeat + 1}; pots ${trace.pots.join(" + ")}; stacks ${trace.stacks.join(" / ")}`);
  }
}

async function main() {
  const dictionary = await loadDictionary();
  const [from, to] = process.argv.slice(2).map(Number);
  const first = from ?? FOUR_SEAT_SEED;
  const last = to ?? first;
  for (let seed = first; seed <= last; seed += 1) {
    const outcome = playFourSeatSession(seed, dictionary);
    if (typeof outcome === "string") {
      if (first === last) console.log(`seed ${seed}: ${outcome}`);
      continue;
    }
    print(seed, outcome);
    return;
  }
  console.log(`no seed in ${first}..${last} fits the script`);
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("probe-four-seat.ts")) await main();
