/**
 * A dictionary the offline tests can hold in their hand.
 *
 * The engine judges every confirmed word against a table's dictionary, so a hand under test
 * needs one. `createDictionary` is the shipped constructor — the judging path is the real one
 * — and only the word list shrinks, to what a test can read in its source. The screens load
 * the shipped list through `useDictionary`; the tests inject one of these instead.
 */

import { DICTIONARIES, createDictionary, type Dictionary } from "@wordpoker/game-rules";

/** Words §8 and §11's examples use, plus two real two-letter entries (AA, QI). */
export const TEST_WORDS = ["AA", "QI", "STRONG", "MONSTER"] as const;

/** Builds a dictionary over exactly `words`; the list is sorted here, as the artifact is. */
export function testDictionary(words: readonly string[] = TEST_WORDS): Dictionary {
  const sorted = [...words].sort();

  return createDictionary({
    id: "en_US-large",
    label: DICTIONARIES["en_US-large"].label,
    source: { file: "test fixture", sha256: "test fixture", lines: sorted.length },
    count: sorted.length,
    words: sorted,
  });
}
