/**
 * Every number Slot Speller plays by (docs/rules/slot-speller.md §47). The web prototype is the
 * source of truth for the defaults; all of them are config so they can be tuned after playtesting.
 */

import { DEFAULT_SPECIAL_TILES } from "../tiles/special-tiles";

/** A length tier: words of at least `minLength` letters score `multiplier` × their base. */
export interface LengthMultiplier {
  readonly minLength: number;
  readonly multiplier: number;
}

/** The multiplier rolls each strip tile gets (§9's rates, reused). */
export interface SlotTileRates {
  readonly doubleLetterChance: number;
  readonly tripleLetterChance: number;
  /** Extra double chance for a letter worth `HIGH_VALUE_POINTS` or more. */
  readonly highValueDoubleBonus: number;
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
  readonly baseTarget: number;
  /** Round n's target is `baseTarget × (1 + targetGrowth)^(n − 1)`, rounded. */
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
  baseTarget: 20,
  targetGrowth: 0.25,
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
  tileRates: {
    doubleLetterChance: DEFAULT_SPECIAL_TILES.doubleLetterChance,
    tripleLetterChance: DEFAULT_SPECIAL_TILES.tripleLetterChance,
    highValueDoubleBonus: DEFAULT_SPECIAL_TILES.highValueDoubleBonus,
  },
};

/** The target score of `round` (1-based). */
export function roundTarget(config: SlotSpellerConfig, round: number): number {
  return Math.round(config.baseTarget * (1 + config.targetGrowth) ** (round - 1));
}

/** The multiplier of the last tier `length` reaches, or 0 below every tier. */
export function tierMultiplier(tiers: readonly LengthMultiplier[], length: number): number {
  let multiplier = 0;
  for (const tier of tiers) {
    if (length >= tier.minLength) multiplier = tier.multiplier;
  }
  return multiplier;
}
