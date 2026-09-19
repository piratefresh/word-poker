/**
 * The word lists a table can be configured with (docs/rules/tiles.md §11).
 *
 * The id is wire vocabulary — a table is dealt against a list, and an evaluation result
 * that did not name the list it was checked against could not be compared with another.
 * The list's words and its displayed label belong to the engine (`@wordpoker/game-rules`),
 * which keeps the ~1.4 MB artifact out of every consumer that only needs to say *which*
 * vocabulary a table is playing.
 */

/** Every dictionary this build can be configured with; one today, and the seam for more. */
export const DICTIONARY_IDS = ["en_US-large"] as const;

/** Names a dictionary a table can play: what §11 calls the configured word list. */
export type DictionaryId = (typeof DICTIONARY_IDS)[number];

/** Whether a value names a shipped dictionary. */
export function isDictionaryId(value: string): value is DictionaryId {
  return (DICTIONARY_IDS as readonly string[]).includes(value);
}
