/**
 * Slot Speller's randomness, kept serializable: the run stores only its seed string and counters,
 * and every random event draws from a fresh `createRng` derived from (seed, stream, index). A
 * saved-and-reloaded run therefore makes the same next spin as the one it was saved from.
 */

import { createRng } from "../core/rng";

/** Which event a generator feeds; `index` tells events of one stream apart (reel, spin count…). */
export type SlotSeedStream = "strip" | "spin" | "split" | "shop";

/** FNV-1a over UTF-16 code units, then murmur3's finaliser so close inputs land far apart. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/** A fresh generator for one event of a run. */
export function slotRng(seed: string, stream: SlotSeedStream, index: number): () => number {
  return createRng(hashSeed(`${seed}\u0000${stream}\u0000${index}`));
}
