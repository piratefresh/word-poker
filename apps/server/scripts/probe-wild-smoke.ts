/**
 * Finds a seed for the Wild online smoke (STO-500) and prints what the browser taps.
 *
 * Replays the smoke's opening against the room's own engine adapter, no sockets: the opponent
 * (seat 0) creates the table and keeps its first offer, the browser (seat 1) keeps Random Wild,
 * the opponent calls its small blind, and the browser uses Random Wild on its pre-flop turn. For
 * each seed and each private tile the browser could discard, it looks for a word the strip spells
 * by taps alone — the rack, then the board, read left to right — that plays the new tile, with no
 * choice tile in it, so the flow taps plain tiles only. Usage, from the repo root:
 *
 *   pnpm --filter @wordpoker/server exec tsx scripts/probe-wild-smoke.ts [firstSeed] [lastSeed]
 */

import { blindsFor, type Tile, type TilePlay } from "@wordpoker/contracts";
import { evaluateWord, loadDictionary, scoreWord, type Dictionary } from "@wordpoker/game-rules";

import { AuthoritativeGame } from "../src/rooms/AuthoritativeGame.js";

const OPPONENT = "opponent";
const BROWSER = "browser";
const BUY_IN = 500;

export interface WildSmokeTrace {
  readonly seed: number;
  readonly discard: Tile;
  readonly newTile: Tile;
  readonly strip: readonly Tile[];
  readonly word: string;
  readonly taps: readonly Tile[];
  readonly score: number;
}

/** The smoke's opening under one seed, discarding the browser's private tile at `discardIndex`. */
export function playWildOpening(
  seed: number,
  discardIndex: number,
  dictionary: Dictionary,
): WildSmokeTrace | null {
  const game = new AuthoritativeGame({
    seed,
    dictionary,
    blinds: blindsFor(BUY_IN),
    turnDurationMs: 30_000,
    powerUps: { deal: "choose3" },
  });
  game.start(
    [
      { playerId: OPPONENT, stack: BUY_IN },
      { playerId: BROWSER, stack: BUY_IN },
    ],
    0,
    0,
  );

  const opening = game.state!;
  const opponentFirst = opening.powers!.draw.slots.find((slot) => slot.playerId === OPPONENT)!.offers[0]!;
  game.dispatch({ type: "pickPower", playerId: OPPONENT, powerUpId: opponentFirst }, 1);
  game.dispatch({ type: "pickPower", playerId: BROWSER, powerUpId: "random_wild" }, 1);
  // Heads-up the button (the opponent, seat 0) acts first pre-flop and calls its small blind.
  game.dispatch({ type: "call", playerId: OPPONENT }, 2);

  const discard = game.state!.seats[1]!.privateTiles[discardIndex];
  if (discard === undefined) return null;
  game.dispatch(
    { type: "usePowerUp", playerId: BROWSER, powerUpId: "random_wild", tileId: discard.id },
    3,
  );

  const state = game.state!;
  const newTile = state.powers!.held[BROWSER]!.swap!.tile;
  const strip = [...state.seats[1]!.privateTiles, ...state.community];
  const found = shortestWordWith(strip, newTile.id, dictionary);
  return found === null ? null : { seed, discard, newTile, strip, ...found };
}

/**
 * The shortest plain-tile word (2–4 letters) the strip spells by taps that plays `tileId`, best
 * score first among the shortest. No choice tiles: the flow should never have to pick a face.
 */
function shortestWordWith(strip: readonly Tile[], tileId: string, dictionary: Dictionary) {
  let best: { word: string; taps: Tile[]; score: number } | null = null;
  const taps: Tile[] = [];

  const visit = (from: number) => {
    if (taps.length >= 2 && taps.some((tile) => tile.id === tileId)) {
      const plays: TilePlay[] = taps.map((tile) => ({ tileId: tile.id }));
      const evaluation = evaluateWord({ available: strip, submission: { plays }, dictionary });
      if (evaluation.valid) {
        const score = scoreWord(evaluation.tiles).total;
        const better =
          best === null ||
          taps.length < best.taps.length ||
          (taps.length === best.taps.length && score > best.score);
        if (better) best = { word: evaluation.word, taps: [...taps], score };
      }
    }
    if (taps.length === 4) return;
    for (let index = from; index < strip.length; index += 1) {
      const tile = strip[index]!;
      if ("alternativeLetter" in tile) continue;
      taps.push(tile);
      visit(index + 1);
      taps.pop();
    }
  };
  visit(0);
  return best;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/probe-wild-smoke.ts");
if (isMain) {
  const first = Number(process.argv[2] ?? 500);
  const last = Number(process.argv[3] ?? first);
  const dictionary = await loadDictionary();
  for (let seed = first; seed <= last; seed += 1) {
    for (const discardIndex of [0, 1]) {
      const trace = playWildOpening(seed, discardIndex, dictionary);
      if (trace === null) continue;
      const face = (tile: Tile) =>
        "alternativeLetter" in tile ? `${tile.letter}/${tile.alternativeLetter}` : tile.letter;
      console.log(
        `seed ${seed}: discard ${trace.discard.id} for ${trace.newTile.letter} (${trace.newTile.id}); ` +
          `strip ${trace.strip.map(face).join(" ")}; ${trace.word} (${trace.score}) = ` +
          trace.taps.map((tile) => tile.id).join(", "),
      );
    }
  }
}
