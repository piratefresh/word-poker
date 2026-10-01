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

/** Which power stream a mixed seed feeds (§44): the Power Draw's offers, or a swap's letter. */
export type PowerSeedSalt = "offer" | "letter";

/** The golden-ratio increment that spreads consecutive seats far apart before the finaliser. */
const SEAT_STEP = 0x9e3779b9;

/** murmur3's 32-bit finaliser: a bijection on int32 whose every output bit hangs on every input bit. */
function fmix32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/** FNV-1a over a salt's UTF-16 code units: a fixed number per salt, computed once per call. */
function saltWord(salt: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < salt.length; i += 1) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193);
  }
  return h | 0;
}

/**
 * The seed of one seat's power stream for one hand, for `createRng`.
 *
 * Mixed, never offset: hand *n* is dealt from `seed + n - 1`, so a stream seeded at
 * `handSeed + seat` would replay a later hand's deal. Here the hand seed and the salt pass
 * through a full-avalanche finaliser before the seat joins, and again after, so the result sits
 * nowhere near any deal seed and the power streams draw nothing from the deal's generator — a
 * hand deals the same tiles with power-ups on or off (§44, Randomness).
 *
 * For a fixed seat and salt it is a bijection on the hand seed: two hands never share a stream.
 * Pinned by golden values, like `createRng`: changing it changes every offer and letter.
 *
 * @param handSeed The hand's deal seed; normalised to an int32 like `createRng`'s.
 * @param seat The seat's position at the table.
 * @param salt Which stream: `offer` for the Power Draw, `letter` for a swap's new letter.
 * @returns An int32 seed.
 */
export function mixSeed(handSeed: number, seat: number, salt: PowerSeedSalt): number {
  const hand = fmix32((handSeed | 0) ^ saltWord(salt));
  return fmix32(hand + Math.imul((seat | 0) + 1, SEAT_STEP));
}
