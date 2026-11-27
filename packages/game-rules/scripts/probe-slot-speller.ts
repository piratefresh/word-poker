/**
 * Slot Speller tuning probe (STO-1165): a greedy bot plays whole runs and isolated grids.
 *
 * Run: pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-slot-speller.ts [firstSeed] [runs] [section]
 * section: all (default) | runs | powers | min
 *
 * The bot, at every step of a spin, tries every nudge and swap (swaps sampled to MAX_SWAPS on wide
 * grids), takes the best grid total, and pays when no move improves. Line scores are memoised by
 * the line's tiles, so a candidate move only re-scores the lines it touches.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import type { Tile } from "@wordpoker/contracts";
import { loadDictionary, type Dictionary } from "../src/words/dictionary";
import { DEFAULT_SLOT_SPELLER_CONFIG, roundTarget, type SlotSpellerConfig } from "../src/slot-speller/config";
import { canLock, nudge, spin, swap, toggleLock } from "../src/slot-speller/actions";
import { cellAt } from "../src/slot-speller/cells";
import { slotLines } from "../src/slot-speller/evaluate";
import { payLine } from "../src/slot-speller/pay-line";
import { SLOT_POWERS, type SlotPowerCounts, type SlotPowerId } from "../src/slot-speller/powers";
import { addWildBlanks, buildStrip, rowCount, windowAt } from "../src/slot-speller/reels";
import { buyExtraSpin, endRun, nextRound, pay } from "../src/slot-speller/run";
import { addReelPrice, buyPower, buyReel } from "../src/slot-speller/shop";
import { slotRng } from "../src/slot-speller/seed";
import { createSlotRun, type SlotSpellerState } from "../src/slot-speller/state";

const firstSeed = Number(process.argv[2] ?? 1);
const runs = Number(process.argv[3] ?? 100);
const section = process.argv[4] ?? "all";
assert.ok(Number.isSafeInteger(firstSeed) && Number.isSafeInteger(runs) && runs > 0);
const MAX_SWAPS = 200;
const MAX_ROUNDS = 25;
const dictionary = await loadDictionary();

// ---------------------------------------------------------------- scoring with a line cache

const caches = new Map<string, Map<string, number>>();

function tileKey(tile: Tile): string {
  if ("blank" in tile && tile.blank) return "?";
  const mult = tile.multiplier === "triple-letter" ? "3" : tile.multiplier === "double-letter" ? "2" : "";
  const alt = "alternativeLetter" in tile ? `/${tile.alternativeLetter}${tile.alternativePoints}` : "";
  return `${tile.letter}${tile.points}${mult}${alt}`;
}

function cacheFor(state: SlotSpellerState): Map<string, number> {
  const key = JSON.stringify([state.powers, state.config.minWordLength, state.config.lengthMultipliers]);
  let cache = caches.get(key);
  if (cache === undefined || cache.size > 400_000) caches.set(key, (cache = new Map()));
  return cache;
}

type Line = ReturnType<typeof slotLines>[number];

function lineScore(cache: Map<string, number>, tiles: readonly Tile[], line: Line, state: SlotSpellerState, dict: Dictionary): number {
  // Premium cells count on rows only, so only a row's key carries them.
  const cells = line.premium
    ? line.cells.map((cell) => {
        const premium = cellAt(state.cells, cell);
        return premium ? `${premium.kind[0]}${premium.multiplier}` : "";
      })
    : [];
  const key = `${tiles.map(tileKey).join(",")}|${cells.join(",")}`;
  let score = cache.get(key);
  if (score === undefined) {
    const context = { dictionary: dict, config: state.config, powers: state.powers, cells: state.cells };
    score = payLine(tiles, line, context).reduce((sum, word) => sum + word.breakdown.score, 0);
    cache.set(key, score);
  }
  return score;
}

function gridTotal(state: SlotSpellerState): number {
  const cache = cacheFor(state);
  let total = 0;
  for (const line of slotLines(state)) {
    total += lineScore(cache, line.cells.map(([r, w]) => state.grid[r]![w]!), line, state, dictionary);
  }
  return total;
}

/** One greedy step: the best-scoring nudge or swap if it beats `current`, else null. */
function bestMove(state: SlotSpellerState, current: number): { state: SlotSpellerState; total: number } | null {
  const cache = cacheFor(state);
  const lines = slotLines(state);
  const rows = state.grid[0]?.length ?? 0;
  const cellLines: number[][] = Array.from({ length: state.reels * rows }, () => []);
  const lineTotals = lines.map((line, index) => {
    for (const [reel, row] of line.cells) cellLines[reel * rows + row]!.push(index);
    return lineScore(cache, line.cells.map(([r, w]) => state.grid[r]![w]!), line, state, dictionary);
  });

  let best: { state: SlotSpellerState; total: number } | null = null;
  for (let reel = 0; reel < state.reels; reel += 1) {
    for (const dir of [-1, 1] as const) {
      const moved = nudge(state, reel, dir);
      if (!moved.ok) continue;
      const total = gridTotal(moved.state);
      if (total > (best?.total ?? current)) best = { state: moved.state, total };
    }
  }

  const cells = state.reels * rows;
  let pairs: [number, number][] = [];
  for (let a = 0; a < cells; a += 1) for (let b = a + 1; b < cells; b += 1) pairs.push([a, b]);
  if (pairs.length > MAX_SWAPS) {
    const rng = slotRng(state.seed, "spin", 10_000 + state.spinCount * 31 + state.moves);
    for (let i = 0; i < MAX_SWAPS; i += 1) {
      const j = i + Math.floor(rng() * (pairs.length - i));
      [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
    }
    pairs = pairs.slice(0, MAX_SWAPS);
  }
  const at = (cell: number): Tile => state.grid[Math.floor(cell / rows)]![cell % rows]!;
  for (const [a, b] of pairs) {
    const ta = at(a);
    const tb = at(b);
    if (tileKey(ta) === tileKey(tb)) continue;
    const touched = new Set([...cellLines[a]!, ...cellLines[b]!]);
    let total = current;
    for (const index of touched) {
      const line = lines[index]!;
      const tiles = line.cells.map(([r, w]) => {
        const cell = r * rows + w;
        return cell === a ? tb : cell === b ? ta : state.grid[r]![w]!;
      });
      total += lineScore(cache, tiles, line, state, dictionary) - lineTotals[index]!;
    }
    if (total > (best?.total ?? current)) {
      const moved = swap(state, [Math.floor(a / rows), a % rows], [Math.floor(b / rows), b % rows]);
      if (moved.ok) best = { state: moved.state, total };
    }
  }
  return best;
}

/** Spins (using Reel Lock on the best word's first two reels when it can), plays greedily, pays. */
function playSpin(start: SlotSpellerState): { state: SlotSpellerState; score: number } {
  let state = start;
  if (canLock(state) && state.bestWord !== null) {
    const words = bestLineWords(state);
    for (const reel of words) {
      const locked = toggleLock(state, reel);
      if (locked.ok) state = locked.state;
    }
  }
  const spun = spin(state);
  assert.ok(spun.ok, spun.ok ? "" : spun.reason);
  state = spun.state;
  let total = gridTotal(state);
  while (state.moves > 0) {
    const next = bestMove(state, total);
    if (next === null) break;
    state = next.state;
    total = next.total;
  }
  const paid = pay(state, dictionary);
  assert.ok(paid.ok);
  return { state: paid.state, score: paid.payout.total };
}

/** The two reels of the grid's best-scoring word (for Reel Lock). */
function bestLineWords(state: SlotSpellerState): number[] {
  const context = { dictionary, config: state.config, powers: state.powers, cells: state.cells };
  let best: { score: number; reels: number[] } = { score: 0, reels: [] };
  for (const line of slotLines(state)) {
    for (const word of payLine(line.cells.map(([r, w]) => state.grid[r]![w]!), line, context)) {
      if (word.breakdown.score > best.score) best = { score: word.breakdown.score, reels: word.cells.map(([r]) => r) };
    }
  }
  return best.reels.slice(0, state.config.lockReels);
}

// ---------------------------------------------------------------- shop policies

const PRIORITY: readonly SlotPowerId[] = [
  "zigzag", "wave", "twins", "extraRow", "heavy", "action", "extraMove", "wild", "longHaul", "split", "lock",
];
const cost = (id: SlotPowerId): number => SLOT_POWERS.find((power) => power.id === id)!.cost;

function buyPowers(state: SlotSpellerState, reserve = 0): SlotSpellerState {
  for (const id of PRIORITY) {
    if (!state.shop?.stock.includes(id) || state.shop.sold.includes(id)) continue;
    if (state.tokens - cost(id) < reserve) continue;
    const bought = buyPower(state, id);
    if (bought.ok) state = bought.state;
  }
  return state;
}

function buyReels(state: SlotSpellerState, reserve = 0): SlotSpellerState {
  while (state.tokens - addReelPrice(state) >= reserve) {
    const bought = buyReel(state);
    if (!bought.ok) break;
    state = bought.state;
  }
  return state;
}

const POLICIES: Record<string, (state: SlotSpellerState) => SlotSpellerState> = {
  power: (state) => buyReels(buyPowers(state)),
  reel: (state) => buyPowers(buyReels(state)),
  /** Buys Extra Row whenever offered; otherwise spends only above an 8-token savings floor. */
  row: (state) => {
    if (state.shop?.stock.includes("extraRow")) {
      const bought = buyPower(state, "extraRow");
      if (bought.ok) state = bought.state;
    }
    const floor = (state.powers.extraRow ?? 0) >= 2 ? 0 : cost("extraRow");
    return buyReels(buyPowers(state, floor), floor);
  },
};

// ---------------------------------------------------------------- whole runs

interface RoundLog {
  round: number;
  target: number;
  spins: number[];
  cleared: boolean;
  earned: number;
  heldAtStart: number;
  reels: number;
  rows: number;
  powers: SlotPowerCounts;
}

function playRun(seed: number, policy: (state: SlotSpellerState) => SlotSpellerState, config: SlotSpellerConfig): RoundLog[] {
  let state = createSlotRun(`probe-${seed}`, config);
  const logs: RoundLog[] = [];
  let log: RoundLog | null = null;
  for (;;) {
    if (log === null) {
      log = { round: state.round, target: state.target, spins: [], cleared: false, earned: 0, heldAtStart: state.tokens,
        reels: state.reels, rows: rowCount(state.config, state.powers), powers: { ...state.powers } };
    }
    if (state.phase === "ready" || state.phase === "between") {
      const played = playSpin(state);
      state = played.state;
      log.spins.push(played.score);
    } else if (state.phase === "short") {
      const extra = buyExtraSpin(state);
      if (extra.ok) state = extra.state;
      else {
        logs.push(log);
        state = endRun(state).state;
        return logs;
      }
    } else if (state.phase === "shop") {
      log.cleared = true;
      log.earned = state.shop?.earned ?? 0;
      logs.push(log);
      log = null;
      if (state.round >= MAX_ROUNDS) return logs;
      state = policy(state);
      const next = nextRound(state);
      assert.ok(next.ok);
      state = next.state;
    } else {
      throw new Error(`unexpected phase ${state.phase}`);
    }
  }
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
const pad = (value: string | number, width: number): string => String(value).padStart(width);
const fmt = (value: number, digits = 1): string => value.toFixed(digits);

function reportRuns(name: string, config: SlotSpellerConfig): void {
  const policy = POLICIES[name]!;
  const all: RoundLog[][] = [];
  const t0 = performance.now();
  for (let seed = firstSeed; seed < firstSeed + runs; seed += 1) {
    const start = performance.now();
    all.push(playRun(seed, policy, config));
    if (process.env.PROBE_VERBOSE) console.error(`seed ${seed}: ${all.at(-1)!.length} rounds, ${fmt((performance.now() - start) / 1000)}s`);
  }
  const seconds = (performance.now() - t0) / 1000;
  const deaths = all.map((logs) => (logs.at(-1)!.cleared ? MAX_ROUNDS + 1 : logs.at(-1)!.round));
  const sorted = [...deaths].sort((a, b) => a - b);
  console.log(`\n== policy "${name}": ${runs} runs in ${fmt(seconds)}s; death round median ${sorted[Math.floor(runs / 2)]}, ` +
    `p10 ${sorted[Math.floor(runs * 0.1)]}, p90 ${sorted[Math.floor(runs * 0.9)]}`);
  console.log(" rnd target reach  clear%  spin  roundpts  earned  held  reels rows  top powers held (share of runs reaching)");
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const here = all.map((logs) => logs.find((entry) => entry.round === round)).filter((entry) => entry !== undefined);
    if (here.length === 0) break;
    const counts = new Map<SlotPowerId, number>();
    for (const entry of here) for (const [id, n] of Object.entries(entry.powers)) if (n) counts.set(id as SlotPowerId, (counts.get(id as SlotPowerId) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `${id} ${Math.round((100 * n) / here.length)}`).join(", ");
    const clear = here.filter((entry) => entry.cleared).length / here.length;
    console.log(`${pad(round, 4)} ${pad(here[0]!.target, 6)} ${pad(here.length, 5)} ${pad(fmt(clear * 100, 0), 6)} ` +
      `${pad(fmt(mean(here.flatMap((entry) => entry.spins))), 6)} ${pad(fmt(mean(here.map((entry) => entry.spins.reduce((a, b) => a + b, 0))), 0), 8)} ` +
      `${pad(fmt(mean(here.filter((entry) => entry.cleared).map((entry) => entry.earned))), 7)} ${pad(fmt(mean(here.map((entry) => entry.heldAtStart))), 5)} ` +
      `${pad(fmt(mean(here.map((entry) => entry.reels))), 6)} ${pad(fmt(mean(here.map((entry) => entry.rows))), 4)}  ${top}`);
  }
}

// ---------------------------------------------------------------- isolated grids

/** A fresh run with `reels` reels and `powers`, ready to spin, with an unreachable target. */
function build(seed: number, reels: number, powers: SlotPowerCounts, config: SlotSpellerConfig): SlotSpellerState {
  const base = createSlotRun(`grid-${seed}`, config);
  const rows = rowCount(config, powers);
  const strips = Array.from({ length: reels }, (_, reel) => {
    const strip = buildStrip(base.seed, reel, config);
    return powers.wild ? addWildBlanks(strip, base.seed, reel, config) : strip;
  });
  return { ...base, powers, reels, strips, top: strips.map(() => 0), grid: strips.map((strip) => windowAt(strip, 0, rows)), target: Number.POSITIVE_INFINITY };
}

/** Mean spin score over `runs` seeds × a 3-spin round (so Reel Lock gets used). */
function meanSpin(reels: number, powers: SlotPowerCounts, config = DEFAULT_SLOT_SPELLER_CONFIG): number {
  const scores: number[] = [];
  for (let seed = firstSeed; seed < firstSeed + runs; seed += 1) {
    let state = build(seed, reels, powers, config);
    for (let i = 0; i < config.spinsPerRound; i += 1) {
      const played = playSpin(state);
      state = played.state;
      scores.push(played.score);
    }
  }
  return mean(scores);
}

function reportPowers(): void {
  const t0 = performance.now();
  const reels = 7;
  const none = meanSpin(reels, {});
  console.log(`\n== each power alone, ${reels}×3 grid, ${runs} seeds × 3 spins: baseline ${fmt(none)} a spin`);
  console.log(" power        spin    delta   per token");
  const conditions: [string, SlotPowerCounts, number][] = [
    ...SLOT_POWERS.map((power): [string, SlotPowerCounts, number] => [power.id, { [power.id]: 1 }, power.cost]),
    ["extraRow×2", { extraRow: 2 }, cost("extraRow") * 2],
    ["+1 reel", {}, DEFAULT_SLOT_SPELLER_CONFIG.addReelBaseCost],
  ];
  for (const [name, powers, price] of conditions) {
    const score = meanSpin(name === "+1 reel" ? reels + 1 : reels, powers);
    console.log(` ${name.padEnd(11)} ${pad(fmt(score), 6)} ${pad(fmt(score - none), 7)} ${pad(fmt((score - none) / price, 2), 8)}`);
  }
  console.log(` (${fmt((performance.now() - t0) / 1000)}s)`);
}

function reportMinLength(): void {
  const t0 = performance.now();
  const config = DEFAULT_SLOT_SPELLER_CONFIG;
  const fourPlus = { ...config, minWordLength: 4 };
  console.log(`\n== starting 5×3 grid, ${runs} seeds × 3 spins (greedy bot)`);
  console.log(` 3-letter words at ×0.5 (shipped): ${fmt(meanSpin(5, {}, config))} a spin`);
  console.log(` 4+ letters only:                  ${fmt(meanSpin(5, {}, fourPlus))} a spin`);
  console.log(` 3-letter words at ×1:             ${fmt(meanSpin(5, {}, { ...config, lengthMultipliers: [{ minLength: 3, multiplier: 1 }, ...config.lengthMultipliers.slice(1)] }))} a spin`);
  console.log(` (${fmt((performance.now() - t0) / 1000)}s)`);
}

const targets = Array.from({ length: 20 }, (_, i) => roundTarget(DEFAULT_SLOT_SPELLER_CONFIG, i + 1));
console.log(`targets r1-20: ${targets.join(" ")}`);
if (section === "all" || section === "min") reportMinLength();
if (section === "all" || section === "powers") reportPowers();
if (section === "all" || section === "runs") for (const name of Object.keys(POLICIES)) reportRuns(name, DEFAULT_SLOT_SPELLER_CONFIG);
if (section in POLICIES) reportRuns(section, DEFAULT_SLOT_SPELLER_CONFIG);
