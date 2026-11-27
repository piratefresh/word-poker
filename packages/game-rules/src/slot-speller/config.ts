/**
 * Every number Slot Speller plays by (docs/rules/slot-speller.md §48). The web prototype is the
 * source of truth for the defaults; all of them are config so they can be tuned after playtesting.
 */

/** A length tier: words of at least `minLength` letters score `multiplier` × their base. */
export interface LengthMultiplier {
  readonly minLength: number;
  readonly multiplier: number;
}

/** The multiplier rolls each strip tile gets (§9's shape). Off by default: premium cells replaced them. */
export interface SlotTileRates {
  readonly doubleLetterChance: number;
  readonly tripleLetterChance: number;
  /** Extra double chance for a letter worth `HIGH_VALUE_POINTS` or more. */
  readonly highValueDoubleBonus: number;
}

/** Premium cells: the board's pattern and how its cells behave (§48, Premium cells). */
export interface SlotCellConfig {
  /** `pattern`: the board's diagonals; `none`: no premium cells. */
  readonly layout: "pattern" | "none";
  /** Whether each row's cells land on new reels every spin; otherwise they stay where the pattern draws them. */
  readonly moving: boolean;
  /** The cells whose tile cannot be swapped in or out. */
  readonly swapLock: "word" | "all" | "none";
  /** Reels from one diagonal to the next. */
  readonly diagonalSpacing: number;
  readonly letterMultiplier: number;
  /** Letter cells on every second diagonal. */
  readonly tripleLetterMultiplier: number;
  readonly wordMultiplier: number;
  /** Word cells on diagonal `tripleWordDiagonal`. */
  readonly tripleWordMultiplier: number;
  /** Counted from 0 at the diagonal through reel 2 of row 1. */
  readonly tripleWordDiagonal: number;
}

export interface SlotSpellerConfig {
  /** Reels a run starts with. */
  readonly reels: number;
  /** Rows a run starts with, before Extra Row. */
  readonly rows: number;
  /** The most reels Add Reel can reach. */
  readonly maxReels: number;
  /** Tiles on each reel's strip. */
  readonly stripLength: number;
  readonly movesPerSpin: number;
  /** Moves Extra Move adds to every spin, per copy held. */
  readonly extraMoveBonus: number;
  readonly spinsPerRound: number;
  readonly minWordLength: number;
  /** Ascending by `minLength`; a word takes the last tier it reaches. */
  readonly lengthMultipliers: readonly LengthMultiplier[];
  /** Long Haul's tiers; a word takes the better of these and `lengthMultipliers`. */
  readonly longHaulMultipliers: readonly LengthMultiplier[];
  /** What each triggered Scoring power multiplies a word by. */
  readonly scoringPowerMultiplier: number;
  /** Round n's target for the first `targets.length` rounds (round 1 first); see `roundTarget`. */
  readonly targets: readonly number[];
  /** Past the table, each round's target is the last one's × (1 + targetGrowth), rounded. */
  readonly targetGrowth: number;
  readonly clearTokens: number;
  readonly tokensPerUnusedSpin: number;
  readonly extraSpinCost: number;
  readonly addReelBaseCost: number;
  readonly rerollBaseCost: number;
  readonly shopOfferCount: number;
  /** Blanks Wild Reel puts on each strip. */
  readonly wildBlanksPerStrip: number;
  /** Grid tiles Split Tiles gives a second face each spin. */
  readonly splitTilesPerSpin: number;
  /** Reels Reel Lock can hold for the next spin. */
  readonly lockReels: number;
  /** A span with more blanks than this spells nothing. */
  readonly maxBlanksPerWord: number;
  readonly tileRates: SlotTileRates;
  readonly cells: SlotCellConfig;
}

export const DEFAULT_SLOT_SPELLER_CONFIG: SlotSpellerConfig = {
  reels: 5,
  rows: 3,
  maxReels: 12,
  stripLength: 30,
  movesPerSpin: 4,
  extraMoveBonus: 2,
  spinsPerRound: 3,
  minWordLength: 3,
  lengthMultipliers: [
    { minLength: 3, multiplier: 0.5 },
    { minLength: 4, multiplier: 1 },
    { minLength: 6, multiplier: 1.5 },
    { minLength: 7, multiplier: 2 },
  ],
  longHaulMultipliers: [
    { minLength: 6, multiplier: 2 },
    { minLength: 7, multiplier: 3 },
  ],
  scoringPowerMultiplier: 2,
  // Tuned with scripts/probe-slot-speller.ts (docs/rules/slot-speller.md, Tuning).
  targets: [20, 40, 70, 110, 160, 230, 320, 450, 620, 820],
  targetGrowth: 0.2,
  clearTokens: 5,
  tokensPerUnusedSpin: 2,
  extraSpinCost: 3,
  addReelBaseCost: 3,
  rerollBaseCost: 1,
  shopOfferCount: 3,
  wildBlanksPerStrip: 2,
  splitTilesPerSpin: 2,
  lockReels: 2,
  maxBlanksPerWord: 2,
  tileRates: { doubleLetterChance: 0, tripleLetterChance: 0, highValueDoubleBonus: 0 },
  cells: {
    layout: "pattern",
    moving: true,
    swapLock: "word",
    diagonalSpacing: 4,
    letterMultiplier: 2,
    tripleLetterMultiplier: 3,
    wordMultiplier: 2,
    tripleWordMultiplier: 3,
    tripleWordDiagonal: 2,
  },
};

/** The target score of `round` (1-based). */
export function roundTarget(config: SlotSpellerConfig, round: number): number {
  const { targets, targetGrowth } = config;
  const listed = targets[Math.min(round, targets.length) - 1] ?? 0;
  return Math.round(listed * (1 + targetGrowth) ** Math.max(0, round - targets.length));
}

/** The multiplier of the last tier `length` reaches, or 0 below every tier. */
export function tierMultiplier(tiers: readonly LengthMultiplier[], length: number): number {
  let multiplier = 0;
  for (const tier of tiers) {
    if (length >= tier.minLength) multiplier = tier.multiplier;
  }
  return multiplier;
}
