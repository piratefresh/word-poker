/**
 * story-coach.ts — what the coach says under the opponent's seat in a story hand.
 *
 * The authored street line (`challenges.ts`) is the fallback; once the player has a word on the
 * rack the coach reads it instead: its score, how far the next star is, and the best tile the word
 * leaves unused. Pure, so the lines are testable without a table.
 */

import type { PowerUpId, Tile, TilePlay } from "@wordpoker/contracts";

export interface UnusedTile {
  letter: string;
  points: number;
}

/** The most valuable tile in `tiles` that the word at `plays` does not use. */
export function bestUnusedTile(tiles: readonly Tile[], plays: readonly TilePlay[]): UnusedTile | null {
  const used = new Set(plays.map((play) => play.tileId));
  let best: Tile | null = null;
  for (const tile of tiles) {
    if (used.has(tile.id)) continue;
    if (best === null || tile.points > best.points) best = tile;
  }
  return best === null ? null : { letter: best.letter, points: best.points };
}

export interface StoryCoachInput {
  /** The node's authored line for this street; said while there is no word to react to. */
  street: string;
  /** The word on the rack, "" while it spells nothing. */
  word: string;
  /** Its score, or `null` while the tiles do not build. */
  score: number | null;
  /** Whether the dictionary has the word: the rack scores any run of tiles, so only a real word is praised. */
  valid: boolean;
  /** The word scores ★★ and ★★★ ask for. */
  goals: { two: number; three: number };
  unused: UnusedTile | null;
}

export function storyCoachLine({ street, word, score, valid, goals, unused }: StoryCoachInput): string {
  if (word === "" || score === null) return street;
  if (!valid) return `${word} isn't a word. Slide the tiles around to spell one.`;
  if (score >= goals.three) return `${word} is ${score}. That's ★★★. Lock it in.`;
  // A tile worth more than a point is the one worth pointing at.
  const tip = unused !== null && unused.points > 1 ? ` The ${unused.letter} is worth ${unused.points}.` : "";
  if (score >= goals.two) return `${word} is ${score}, a ★★. ${goals.three - score} more for ★★★.${tip}`;
  return `${word} is ${score}. ${goals.two - score} more for ★★.${tip}`;
}

/** The coach's one-line tip for each power, said the first time a draft offers it (STO-975). */
const POWER_TIPS: { readonly [Id in PowerUpId]: string } = {
  random_wild: "Wild Tile trades a tile you can't use for a random letter.",
  vowel_magnet: "Vowel Magnet: stuck with consonants? Trade one for a vowel.",
  blank_tile: "Blank Tile plays as any letter you like, but scores 0.",
  spotlight: "Spotlight doubles one table tile for everyone, so pick one only you can use.",
  river_review: "River Review shows you the best words you missed, after the hand.",
  pickpocket: "Pickpocket: give away your worst tile and take one of theirs, sight unseen.",
  tile_lock: "Tile Lock: spot the table tile they need, and take it off them.",
  multiplier: "Multiplier: put it on your best letter. It scores double.",
  high_value_tile: "High Value Tile hands you an X, Z or Q. Big points if you can spell with it.",
};

/** What the coach says over a draft that shows powers for the first time; "" when none are new. */
export function powerIntroLine(fresh: readonly PowerUpId[]): string {
  if (fresh.length === 0) return "";
  return `${fresh.length === 1 ? "New power!" : "New powers!"} ${fresh.map((id) => POWER_TIPS[id]).join(" ")}`;
}
