/**
 * The one randomness source in the engine. Callers pass a seed; the engine never
 * reaches for the ambient one (`Math.random`) and never reads a clock, so the same
 * inputs always produce the same outputs (AGENTS.md) — offline play, replays, and
 * the server/client reconcile all depend on that.
 *
 * The algorithm is mulberry32 (32-bit state, period 2^32, well-scrambled output),
 * pinned by golden-value tests: changing it changes every deal for every existing
 * seed, so it is a deliberate, reviewed event rather than a refactor side effect.
 */

/** One step of the Weyl sequence mulberry32 advances its state by. */
const STATE_STEP = 0x6d2b79f5;

/** 2^32 — the divisor that maps the scrambled uint32 onto `[0, 1)`. */
const UINT32_RANGE = 4294967296;

/** Where {@link mixSeed}'s fold starts: an arbitrary odd constant no caller can name by accident. */
const MIX_START = 0x2545_f491;

/**
 * Folds a key — the numbers that name one stream — into a single seed.
 *
 * `createRng` places mulberry32's state on a Weyl sequence, so seeds a constant apart start the
 * *same* trajectory offset by that constant: a caller that named streams by adding salts to a
 * hand's seed would get streams that are related, not independent, and two decisions it meant
 * to separate could share draws. Hashing the key first is what makes "a different decision"
 * mean "a different stream" rather than "the same stream, later".
 *
 * The fold is the standard 32-bit finalizer — two multiplications by odd constants with a
 * xor-shift between them, which spreads every bit of the input across the whole word — applied
 * once per part, so every part moves every later one.
 *
 * @param parts The key, in whatever order the caller fixes. Each is normalised to an int32,
 *   and equal parts in equal order give an equal seed.
 * @returns A seed `createRng` can be built from.
 */
export function mixSeed(parts: readonly number[]): number {
  let hash = MIX_START;

  for (const part of parts) {
    let mixed = (hash ^ part) | 0;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0_aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a_2d97);
    hash = (mixed ^ (mixed >>> 15)) | 0;
  }

  return hash;
}

/**
 * Creates an independent, deterministic pseudo-random number generator.
 *
 * @param seed Any number; it is normalised to an int32 (`| 0`), so fractional
 *   seeds truncate and out-of-range seeds wrap. Seeds that normalise to the same
 *   int32 produce the same sequence.
 * @returns A function that yields the next value in `[0, 1)` on every call.
 *   Instances share no state: interleaving draws from two generators does not
 *   perturb either sequence.
 */
export function createRng(seed: number): () => number {
  let state = seed | 0;

  return function next(): number {
    state = (state + STATE_STEP) | 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}
