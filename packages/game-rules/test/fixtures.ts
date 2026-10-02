/**
 * A dictionary for tests, the size of a hand.
 *
 * The engine judges every confirmed word against a dictionary (offline.ts), so a test that
 * walks a hand to its payout has to hand it one. `createDictionary` is the shipped
 * constructor, so the judging path under test is the real one; only the word list shrinks,
 * from 141,962 entries to what a test can read in its source.
 */

import { DICTIONARIES, createDictionary, type Dictionary } from "../src/words/dictionary";

/** Words the rules' own fixtures use — real entries of the shipped en_US-large list (§8). */
export const TEST_WORDS = ["AA", "QI", "STRONG", "MONSTER"] as const;

/**
 * Builds a dictionary over exactly `words`.
 *
 * The list is sorted here because the artifact contract is a strictly ascending list, and a
 * test should not have to spell its words in order to be valid.
 */
export function testDictionary(words: readonly string[]): Dictionary {
  const sorted = [...words].sort();

  return createDictionary({
    id: "en_US-large",
    label: DICTIONARIES["en_US-large"].label,
    source: { file: "test fixture", sha256: "test fixture", lines: sorted.length },
    count: sorted.length,
    words: sorted,
  });
}

/**
 * One dictionary shared by reference, for the hands whose words do not matter — a seat that
 * never confirms, or one whose word the test checks for its shape alone.
 *
 * Shared rather than rebuilt per call because a dictionary carries a lookup function, and two
 * dictionaries are never deeply equal: hands built against the same instance are.
 */
export const TEST_DICTIONARY: Dictionary = testDictionary(TEST_WORDS);

/**
 * A table state as plain data.
 *
 * `structuredClone` cannot copy a state that carries the table's dictionary — a dictionary
 * holds its lookup function — so this clones everything else and puts the same dictionary
 * back. A state compared against its clone therefore proves an action left the table's data
 * alone, its vocabulary included.
 */
export function cloneState<State extends { dictionary: unknown }>(state: State): State {
  return { ...structuredClone({ ...state, dictionary: null }), dictionary: state.dictionary };
}
