/**
 * Weighted sampling without replacement: how the Power Draw picks the powers it offers (§44).
 * Pure like the rest of the engine — the generator arrives as an argument.
 */

/**
 * Draws up to `count` distinct items, each draw weighted among the items still left.
 *
 * One draw is one `rng()` call: the roll lands on an item with probability proportional to its
 * weight, and that item leaves the pool before the next draw. When `count` covers every item,
 * all of them come back, in a weighted seeded order — so the first item is still the likeliest
 * heavy one, which is what a timed-out Power Draw keeps.
 *
 * @param items The pool; not modified.
 * @param weightOf Each item's weight; it must be finite and above zero.
 * @param count How many items to draw: a whole number, zero or more.
 * @param rng The seeded generator, as built by `createRng`.
 * @returns `min(count, items.length)` items, in the order drawn.
 * @throws {RangeError} On a count that is not a whole number of zero or more, or on a weight
 *   that is not finite and positive.
 */
export function weightedSampleWithoutReplacement<Item>(
  items: readonly Item[],
  weightOf: (item: Item) => number,
  count: number,
  rng: () => number,
): Item[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`A sample takes a whole number of items, not ${count}.`);
  }

  const pool = items.map((item) => {
    const weight = weightOf(item);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`A sample weight must be finite and above zero, not ${weight}.`);
    }
    return { item, weight };
  });

  const drawn: Item[] = [];
  while (drawn.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    // Rounding can leave the roll a hair past the last weight; the last item takes that residue.
    let index = pool.length - 1;
    for (const [candidate, entry] of pool.entries()) {
      if (roll < entry.weight) {
        index = candidate;
        break;
      }
      roll -= entry.weight;
    }
    const [picked] = pool.splice(index, 1);
    if (picked !== undefined) drawn.push(picked.item);
  }

  return drawn;
}
