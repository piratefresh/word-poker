/** Slot Speller's power pool (§48, Powers): data only; each effect lives where it applies. */

export type SlotPowerId =
  | "hot"
  | "jackpot"
  | "wave"
  | "zigzag"
  | "extraMove"
  | "bigHold"
  | "wild"
  | "action"
  | "heavy"
  | "twins"
  | "longHaul";

export type SlotPowerType = "Grid" | "Lines" | "Moves" | "Tiles" | "Scoring";

export interface SlotPower {
  readonly id: SlotPowerId;
  readonly name: string;
  readonly type: SlotPowerType;
  /** Shop price in tokens. */
  readonly cost: number;
  /** The most copies a run can hold; Zigzag Lines is capped by the free row pairs instead. */
  readonly max: number;
  readonly glyph: string;
  readonly description: string;
}

/** How many copies of each power a run holds; a missing id holds none. */
export type SlotPowerCounts = Partial<Record<SlotPowerId, number>>;

export const SLOT_POWERS: readonly SlotPower[] = [
  { id: "hot", name: "Hot Cell", type: "Grid", cost: 4, max: Infinity, glyph: "3L", description: "Adds a permanent triple-letter cell that stays put. Can be bought again." },
  { id: "jackpot", name: "Jackpot Cell", type: "Grid", cost: 7, max: Infinity, glyph: "3W", description: "Adds a permanent triple-word cell that stays put. Can be bought again." },
  { id: "wave", name: "Wave Lines", type: "Lines", cost: 6, max: 1, glyph: "≈", description: "Two weaving lines, and their mirror, pay." },
  { id: "zigzag", name: "Zigzag Lines", type: "Lines", cost: 6, max: Infinity, glyph: "ZZ", description: "Pick two neighbouring rows: the two lines zigzagging between them pay. Buy again for another pair." },
  { id: "extraMove", name: "Extra Move", type: "Moves", cost: 5, max: 1, glyph: "+2", description: "+2 moves every spin." },
  { id: "bigHold", name: "Big Hold", type: "Moves", cost: 5, max: 1, glyph: "H3", description: "Hold up to 3 reels between spins instead of 1." },
  { id: "wild", name: "Wild Reel", type: "Tiles", cost: 5, max: 1, glyph: "?", description: "Blanks on the strips: any letter, scores 0." },
  { id: "action", name: "Action", type: "Scoring", cost: 4, max: 1, glyph: "ING", description: "Words ending ING or ED score ×2." },
  { id: "heavy", name: "Heavy", type: "Scoring", cost: 4, max: 1, glyph: "JQ", description: "Words with J, Q, X or Z score ×2." },
  { id: "twins", name: "Twins", type: "Scoring", cost: 4, max: 1, glyph: "LL", description: "Words with a double letter score ×2." },
  { id: "longHaul", name: "Long Haul", type: "Scoring", cost: 4, max: 1, glyph: "×3", description: "Length mult ×2 at 6 letters, ×3 at 7+." },
];

/** Copies of `id` held, clamped to the power's `max`. */
export function powerCount(powers: SlotPowerCounts, id: SlotPowerId): number {
  const max = SLOT_POWERS.find((power) => power.id === id)?.max ?? 0;
  return Math.min(Math.max(powers[id] ?? 0, 0), max);
}

export function hasPower(powers: SlotPowerCounts, id: SlotPowerId): boolean {
  return powerCount(powers, id) > 0;
}
