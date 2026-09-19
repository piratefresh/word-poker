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
