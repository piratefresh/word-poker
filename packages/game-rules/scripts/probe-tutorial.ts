/**
 * Run: pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-tutorial.ts [firstSeed] [lastSeed]
 *
 * Searches seeds for the tutorial's Classic hand (`src/tutorial.ts`): three seats, the hero on
 * the button. A candidate gives the hero plain tiles, a word that uses both private tiles and
 * beats Jay's best word, and something to draft as early as the flop. Prints one JSON line per
 * candidate with the hero's strongest words so a person can pick a recognisable target.
 */
import assert from "node:assert/strict";

import type { Tile, TilePlay } from "@wordpoker/contracts";

import { resolveSubmission } from "../src/words/building";
import { evaluateBestWord } from "../src/bot/bot-word";
import { loadDictionary, type Dictionary } from "../src/words/dictionary";
import { availableTiles, startHand } from "../src/table/offline";
import { scoreWord } from "../src/words/scoring";
import { TUTORIAL_PLAYERS } from "../src/table/tutorial";

const firstSeed = Number(process.argv[2] ?? 1);
const lastSeed = Number(process.argv[3] ?? firstSeed + 4999);
assert.ok(Number.isSafeInteger(firstSeed) && Number.isSafeInteger(lastSeed) && lastSeed >= firstSeed);
const dictionary = await loadDictionary();

interface Found {
  word: string;
  score: number;
  tileIds: string[];
}

/** Every dictionary word the tiles spell, plain tiles only — the probe skips choice tiles. */
function allWords(available: readonly Tile[], dict: Dictionary): Found[] {
  const found = new Map<string, Found>();
  const played: TilePlay[] = [];
  const used = new Set<string>();
  const visit = (word: string) => {
    if (word.length >= 2 && dict.isWord(word)) {
      const resolution = resolveSubmission({ available, submission: { plays: [...played] } });
      if (resolution.ok) {
        const score = scoreWord(resolution.tiles).total;
        const prior = found.get(word);
        if (prior === undefined || prior.score < score) {
          found.set(word, { word, score, tileIds: played.map((play) => play.tileId) });
        }
      }
    }
    for (const tile of available) {
      if (used.has(tile.id)) continue;
      const next = word + tile.letter;
      if (dict.hasPrefix?.(next) === false) continue;
      used.add(tile.id);
      played.push({ tileId: tile.id });
      visit(next);
      played.pop();
      used.delete(tile.id);
    }
  };
  visit("");
  return [...found.values()].sort((a, b) => b.score - a.score || b.word.length - a.word.length);
}

const label = (tile: Tile) =>
  tile.letter + (tile.multiplier === "double-letter" ? "²" : tile.multiplier === "triple-letter" ? "³" : "");

for (let seed = firstSeed; seed <= lastSeed; seed += 1) {
  const state = startHand({ seed, players: TUTORIAL_PLAYERS, nowMs: 0, dictionary });
  const hero = state.seats[0];
  assert.ok(hero);
  const heroTiles = availableTiles(state, 0);
  if (heroTiles.some((tile) => "alternativeLetter" in tile)) continue;

  const jay = evaluateBestWord({ available: availableTiles(state, 2), dictionary });
  if (jay === null) continue;
  const privateIds = new Set(hero.privateTiles.map((tile) => tile.id));
  const flopIds = new Set([...privateIds, ...state.community.slice(0, 3).map((tile) => tile.id)]);

  const words = allWords(heroTiles, dictionary);
  const winners = words.filter((found) =>
    found.word.length >= 5 && found.word.length <= 6 && found.score >= jay.score + 2 &&
    [...privateIds].every((id) => found.tileIds.includes(id)));
  const onFlop = words.filter((found) =>
    found.word.length >= 3 && found.tileIds.every((id) => flopIds.has(id)) &&
    [...privateIds].every((id) => found.tileIds.includes(id)));
  if (winners.length === 0 || onFlop.length === 0) continue;

  console.log(JSON.stringify({
    seed,
    private: hero.privateTiles.map(label).join(" "),
    board: state.community.map(label).join(" "),
    jay: `${jay.word} ${jay.score}`,
    winners: winners.slice(0, 8).map((found) => `${found.word} ${found.score}`),
    onFlop: onFlop.slice(0, 5).map((found) => `${found.word} ${found.score}`),
  }));
}
