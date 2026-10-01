/**
 * The dictionary: the configured word list a submitted word is checked against
 * (docs/rules/tiles.md §11 — a word must appear in the configured dictionary).
 *
 * The engine never reads files or the network (AGENTS.md), so the words arrive as data, in
 * two steps: a build step — `pnpm run dictionary:prepare` from the repo root — turns
 * the raw word list into the checked-in artifact `data/<id>.json`, and this module turns that
 * artifact into a lookup. `createDictionary` takes an artifact a caller already holds;
 * `loadDictionary` fetches the shipped one. Neither reads a clock, the environment, or
 * anything else outside its arguments, so the same artifact always yields the same answers.
 *
 * The artifact is ~1.4 MB of words, so nothing here loads it implicitly. `DICTIONARIES` is
 * what a mode displays before play (§11: the dictionary has to be named before joining) and
 * costs a table lookup; the word list itself arrives the first time a mode asks for it —
 * entering the tutorial or an offline hand — and is kept after that. Lookups binary-search
 * the artifact's sorted words, which needs no second copy of 141,962 strings.
 */

import { DICTIONARY_IDS, isDictionaryId, type DictionaryId } from "@wordpoker/contracts";

/**
 * The dictionaries this build ships. One today, and the id is the seam: a second prepared
 * artifact (TWL, SOWPODS) joins this list and `loadDictionary("…")` takes its name, with no
 * change to any caller's shape. The ids themselves are wire vocabulary and live in
 * `@wordpoker/contracts`; this table is the engine's half — the label a mode displays and
 * the artifact each id loads.
 */

/** What a mode shows before play: which words count, in the player's terms. */
export interface DictionaryInfo {
  readonly id: DictionaryId;
  readonly label: string;
}

/**
 * The shipped dictionaries, by id.
 *
 * `label` is the name a surface displays, and it lives here — not only in the artifact — so
 * that naming the vocabulary before play never depends on loading it. The prepare step reads
 * its label from this table, so the artifact cannot describe itself differently from the way
 * the app displays it.
 */
export const DICTIONARIES: Readonly<Record<DictionaryId, DictionaryInfo>> = {
  "en_US-large": { id: "en_US-large", label: "en_US-large (broad English)" },
};

/** Which file the words were prepared from, with the fingerprint that pins that source. */
export interface DictionarySource {
  readonly file: string;
  readonly sha256: string;
  readonly lines: number;
}

/**
 * `data/<id>.json` as `dictionary:prepare` writes it. Untrusted until `createDictionary`
 * checks it: the file is generated, moved between builds, and could be truncated or land from
 * an older normalization, so the loader treats every field as a claim to verify.
 */
export interface DictionaryArtifact {
  readonly id: string;
  readonly label: string;
  readonly source: DictionarySource;
  readonly count: number;
  readonly words: readonly string[];
}

/** The word list a hand validates against. */
export interface Dictionary extends DictionaryInfo {
  readonly source: DictionarySource;
  /** How many words the list holds — the artifact's pinned `count`, re-checked against it. */
  readonly size: number;
  /**
   * Whether `word` is in the list. The check normalises what it is handed — surrounding
   * whitespace trimmed, letters upper-cased — so a draft, a typed guess, and a tile row
   * all reach the list as the same word, and anything that is not an A–Z run of at least
   * two letters is `false` rather than normalised into a word it never was.
   */
  isWord(word: string): boolean;
  /** Optional search accelerator. False rules out every continuation. */
  hasPrefix?(prefix: string): boolean;
}

/**
 * Raised when an artifact cannot back a lookup: an id no mode can ask for, a `count` that
 * disagrees with the words it arrived with, or words no longer in sorted order.
 *
 * All three are data problems, not caller mistakes, and all three silently produce wrong
 * answers if ignored — a truncated count makes `size` a lie, unsorted words make half the
 * list unreachable by binary search. Named so a caller can tell them from a bug in its own
 * code, and the message names the artifact it refused.
 */
export class DictionaryArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryArtifactError";
  }
}

/** §12: a word is at least two letters, so nothing shorter can be in the list. */
const MIN_WORD_LETTERS = 2;

/** A word as the artifact stores it: two or more A–Z letters, nothing else. */
const WORD_INPUT = /^[A-Za-z]{2,}$/;

/**
 * Whether `word` is in a sorted word list, by binary search.
 *
 * The shape test runs on the *trimmed* input, before any upper-casing, so nothing outside
 * the words the artifact can hold is searched for: `toUpperCase` alone would turn `ß` into
 * `SS`, inventing a two-letter match the caller never wrote. Trimming first is what lets a
 * caller hand over whatever it has — a draft with stray spaces, a lowercase guess — and get
 * the same answer the list would give the bare word.
 *
 * @param words The artifact's words, strictly ascending.
 * @param word The candidate, whatever its case and surrounding whitespace.
 */
function isWord(words: readonly string[], word: string): boolean {
  const trimmed = word.trim();
  if (!WORD_INPUT.test(trimmed)) {
    return false;
  }

  // ASCII-only input, so upper-casing is a per-character map: no length surprises.
  const wanted = trimmed.toUpperCase();
  let low = 0;
  let high = words.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = words[middle];
    // Unreachable while `low <= high` bounds `middle` inside the list, but the index is
    // optional under `noUncheckedIndexedAccess`, so it is spelled out rather than cast.
    if (candidate === undefined) {
      return false;
    }
    if (candidate === wanted) {
      return true;
    }
    if (candidate < wanted) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return false;
}

/** Lower-bound lookup over the existing list; no second dictionary or startup index. */
function hasPrefix(words: readonly string[], prefix: string): boolean {
  const trimmed = prefix.trim();
  if (!/^[A-Za-z]*$/.test(trimmed)) return false;
  const wanted = trimmed.toUpperCase();
  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const candidate = words[middle];
    if (candidate !== undefined && candidate < wanted) low = middle + 1;
    else high = middle;
  }
  return words[low]?.startsWith(wanted) ?? false;
}

/**
 * Turns a prepared artifact into the lookup a hand validates against.
 *
 * Every check here is a precondition of the binary search or of what `size` claims, and each
 * one is cheaper than the wrong answers it prevents: the id has to be one a mode can ask for,
 * the label has to be the one the app would display, `count` has to match the words that
 * actually arrived, and the words have to be strictly ascending. A dictionary that fails any
 * of them is a broken build, so it throws rather than playing a hand with half a vocabulary.
 *
 * @param artifact The prepared word list, e.g. the contents of `data/en_US-large.json`.
 * @throws {DictionaryArtifactError} When the artifact cannot back a lookup.
 */
export function createDictionary(artifact: DictionaryArtifact): Dictionary {
  if (!isDictionaryId(artifact.id)) {
    throw new DictionaryArtifactError(
      `unknown dictionary "${artifact.id}": this build ships ${DICTIONARY_IDS.join(", ")}`,
    );
  }

  const info = DICTIONARIES[artifact.id];
  if (artifact.label !== info.label) {
    throw new DictionaryArtifactError(
      `dictionary "${artifact.id}" is labelled "${artifact.label}", but this build displays "${info.label}"`,
    );
  }

  const { words } = artifact;
  if (words.length !== artifact.count) {
    throw new DictionaryArtifactError(
      `dictionary "${artifact.id}" claims ${artifact.count} entries but carries ${words.length}`,
    );
  }

  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1];
    const current = words[index];
    if (previous === undefined || current === undefined || previous >= current) {
      throw new DictionaryArtifactError(
        `dictionary "${artifact.id}" is not sorted at entry ${index}: "${previous}" precedes "${current}"`,
      );
    }
  }

  return {
    id: info.id,
    label: info.label,
    source: artifact.source,
    size: words.length,
    isWord: (word: string) => isWord(words, word),
    hasPrefix: (prefix: string) => hasPrefix(words, prefix),
  };
}

/** One lazy import per shipped dictionary: the artifact arrives when a mode first asks. */
const ARTIFACT_LOADERS: Record<DictionaryId, () => Promise<DictionaryArtifact>> = {
  "en_US-large": () => import("../../data/en_US-large.json").then((module) => module.default),
};

/** The dictionaries already loaded this session, by id. */
const loaded = new Map<DictionaryId, Promise<Dictionary>>();

/**
 * Loads one of the shipped dictionaries, once per id.
 *
 * The import is dynamic because the id is the caller's choice at runtime and because the
 * artifact is ~1.4 MB: a static import would put every shipped word list on the startup path
 * of every consumer, including the ones that never build a word (STO-307 cost gate). Callers
 * get the same dictionary back on every call, so a mode can ask per turn without re-reading
 * anything.
 *
 * @param id Which shipped dictionary; defaults to the configured English list.
 * @throws {DictionaryArtifactError} When the shipped artifact cannot back a lookup.
 */
export function loadDictionary(id: DictionaryId = "en_US-large"): Promise<Dictionary> {
  let pending = loaded.get(id);
  if (pending === undefined) {
    pending = ARTIFACT_LOADERS[id]().then(createDictionary);
    loaded.set(id, pending);
  }
  return pending;
}
