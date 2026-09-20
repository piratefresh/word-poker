/**
 * word-search.ts — the best word a rack can spell: the walk §19's window confirms from, and
 * the one a bot reads every seat's hand through when it prices a bet.
 *
 * `./building` owns what a play spells and `./scoring` owns what it is worth; this module is
 * the walk that puts the two together. Every order of every subset of a seat's physical tiles
 * is spelled a tile at a time, and each word the table's dictionary counts becomes a
 * candidate. A rack holds at most seven physical tiles, so the walk is bounded — but a bot's
 * equity estimator runs it hundreds of times inside one decision, so the two things that make
 * it cheap are worth being explicit about:
 *
 * - **The winner does not depend on the order tiles are tried.** One candidate beats another
 *   on §7's score, then §21.1's letter count, then the word itself (A–Z first) — a total order
 *   over (score, letters, word). A walk that visits every candidate therefore ends on the same
 *   word however it moves, which frees the order to be chosen for what it buys rather than for
 *   what it means: strongest tile faces first, so a high bar is set before the deep branches
 *   are reached. (Two plays that spell the identical word for the identical score are the one
 *   thing the order still decides — which of two look-alike tiles is played first. No caller
 *   can see the difference: the word, its score and its letters are the same either way.)
 * - **A prefix no word extends is not walked.** A play whose letters start no dictionary word
 *   cannot become one by playing more tiles, and every word is a prefix of itself, so the
 *   whole subtree below such a play holds nothing worth visiting. Over a full rack that is
 *   the difference between tens of thousands of spelled prefixes and a few hundred — measured
 *   at ~50× on the shipped 141,962-word list, with identical results on every rack tried.
 *
 * The score is carried down the walk rather than rebuilt at each node: §7's contributions are
 * additive, so a node costs one `resolvePlay` and one dictionary lookup instead of a
 * `scoreWord` over its whole prefix.
 *
 * Repeated searches are served from a bounded memo keyed by every evaluation input — the
 * tiles, under the list that judges them — so warmth changes what a search costs and never
 * what it returns. Nothing here reads a clock, a seed, or the table (`AGENTS.md`): the tiles
 * are the whole input, and the same tiles always give the same word.
 */

import type { Tile, TilePlay, TilePlayResolution, WordScore, WordSubmission } from "@wordpoker/contracts";

import { MIN_WORD_LETTERS, resolvePlay } from "./building";
import type { Dictionary } from "./dictionary";
import { fullRackBonus, multiplierFactor, scoreWord } from "./scoring";

/** One buildable candidate: the submission that spells it, and what §7 says it is worth. */
export interface WordCandidate {
  readonly submission: WordSubmission;
  readonly word: string;
  /**
   * §7's breakdown for the word, not just its total: §21's ladder compares the letters and
   * their printed values, and a caller ranking seats needs the same numbers the reveal reads.
   */
  readonly score: WordScore;
}

/** What a search is handed: the tiles a seat may play, and the words that count. */
export interface SearchWordsOptions {
  /** Every tile the seat may play: its private tiles plus the community board (§12). */
  readonly available: readonly Tile[];
  readonly dictionary: Dictionary;
}

/**
 * How many searches one dictionary's memo holds.
 *
 * The repeats a decision actually asks about are few: a seat's own rack is the same on every
 * simulated world of an equity estimate and the same again on its next turn. The bound is
 * what keeps a long session from accumulating racks it will never ask about again, and
 * eviction costs a re-walk, never an answer.
 */
const MEMO_LIMIT = 512;

/**
 * Searches already run, per dictionary.
 *
 * Keyed by the dictionary object rather than by its id, because an id is not an identity:
 * two lists can carry the same one, and a memory that answered for the wrong list would make
 * a search's result depend on what was asked before it. A `WeakMap` says exactly what is true
 * — this search, on these tiles, under this list.
 */
const memos = new WeakMap<Dictionary, Map<string, WordCandidate | null>>();

/**
 * A rack as the memo names it: the tiles in an order no caller chose.
 *
 * Every field the walk reads is spelled out — a tile that prints the same letters but carries
 * §9's multiplier is a different search — and the tiles are sorted, because a rack is a set:
 * the same seven tiles must find the same memory whatever order they arrived in.
 */
function rackKey(available: readonly Tile[]): string {
  const tiles = available.map((tile) => {
    const faces =
      "alternativeLetter" in tile
        ? `${tile.alternativeLetter}:${tile.alternativePoints}`
        : "sequenceLetter" in tile
          ? `${tile.sequenceLetter}:${tile.sequencePoints}`
          : "";
    return `${tile.id}:${tile.letter}:${tile.points}:${faces}:${tile.multiplier ?? ""}`;
  });

  return tiles.sort().join("|");
}

/**
 * The highest value the tile prints, multiplier aside — how the walk orders a rack.
 *
 * This is an ordering, not a rule: it decides nothing but which branch is tried first, so it
 * cannot disagree with §6 about what a tile is worth. A high ceiling first is what makes the
 * prune below pay, because the branches most likely to raise the bar are the ones walked
 * before it is set.
 */
function printedCeiling(tile: Tile): number {
  if ("sequenceLetter" in tile) {
    return Math.max(tile.points, tile.sequencePoints);
  }
  if ("alternativeLetter" in tile) {
    return Math.max(tile.points, tile.alternativePoints);
  }
  return tile.points;
}

/**
 * Whether a candidate beats the best found so far: §7's score, then §21.1's letter count,
 * then the word itself, A–Z first.
 *
 * The order is the policy, and it is written down because "stable" has to be checkable: a
 * search that picked by score alone would answer a different word whenever two score alike,
 * and the same table would stop replaying the same way.
 */
function beats(total: number, word: string, best: { readonly word: string; readonly total: number }): boolean {
  if (total !== best.total) {
    return total > best.total;
  }
  if (word.length !== best.word.length) {
    return word.length > best.word.length;
  }
  return word < best.word;
}

/**
 * The ways one tile can be played (§10): a choice tile names the face it plays, and every
 * other tile — single letter or fixed sequence — plays the faces it prints.
 */
function faceOptions(tile: Tile): readonly TilePlay[] {
  return "alternativeLetter" in tile
    ? [
        { tileId: tile.id, chosenFace: tile.letter },
        { tileId: tile.id, chosenFace: tile.alternativeLetter },
      ]
    : [{ tileId: tile.id }];
}

/** The walk itself: every buildable word the rack can spell, and the policy's winner. */
function walk(dictionary: Dictionary, available: readonly Tile[]): WordCandidate | null {
  const order = [...available].sort((a, b) => {
    const byCeiling = printedCeiling(b) - printedCeiling(a);
    if (byCeiling !== 0) return byCeiling;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const used = new Set<string>();
  const plays: TilePlay[] = [];
  let word = "";
  /** §7's modified letter score for the tiles played so far; the rack bonus lands at the end. */
  let letters = 0;
  /** The winner so far, kept as its total — §7's breakdown is rebuilt once, for this one. */
  let best: Winner | null = null;

  /** Whether the play just made is a word the table counts, and beats the best so far. */
  const consider = (): void => {
    if (word.length < MIN_WORD_LETTERS || !dictionary.isWord(word)) {
      return;
    }
    const total = letters + fullRackBonus(plays.length);
    if (best !== null && !beats(total, word, best)) {
      return;
    }
    best = { submission: { plays: [...plays] }, word, total };
  };

  const visit = (): Winner | null => {
    consider();

    for (const tile of order) {
      if (used.has(tile.id)) {
        continue;
      }

      for (const play of faceOptions(tile)) {
        const resolution = resolvePlay(tile, play);
        if (!resolution.ok) {
          continue;
        }

        const wordBefore = word;
        const lettersBefore = letters;
        used.add(tile.id);
        plays.push(play);
        for (const { letter, points } of resolution.play.letters) {
          word += letter;
          letters += points * multiplierFactor(resolution.play.multiplier);
        }

        // §10–§12 in one test: the letters are already a word's beginning, or nothing played
        // here can become one. `hasPrefix` is true for every word, so no candidate is lost.
        if (dictionary.hasPrefix(word)) {
          visit();
        }

        used.delete(tile.id);
        plays.pop();
        word = wordBefore;
        letters = lettersBefore;
      }
    }

    // Returned rather than read from `best` by the caller: the assignment happens inside this
    // function, and TS does not track that from out here — reading the closure variable would
    // narrow it to the `null` it was initialised with.
    return best;
  };

  const winner = visit();
  if (winner === null) {
    return null;
  }

  // One `scoreWord` for the winner, so the breakdown §21 reads comes from the same place the
  // showdown's does. Its total is the number the walk compared, by the same additive rule.
  return {
    submission: winner.submission,
    word: winner.word,
    score: scoreWord(resolutionsOf(available, winner.submission.plays)),
  };
}

/** The winner so far, as the walk carries it: the plays, the word, and §7's total for them. */
interface Winner {
  readonly submission: WordSubmission;
  readonly word: string;
  readonly total: number;
}

/** The resolutions behind a submission, in word order — what `scoreWord` reads (§7). */
function resolutionsOf(available: readonly Tile[], plays: readonly TilePlay[]): TilePlayResolution[] {
  const resolutions: TilePlayResolution[] = [];

  for (const play of plays) {
    const tile = available.find((candidate) => candidate.id === play.tileId);
    if (tile === undefined) {
      continue;
    }
    const resolution = resolvePlay(tile, play);
    if (resolution.ok) {
      resolutions.push(resolution.play);
    }
  }

  return resolutions;
}

/**
 * The best word a rack can spell, or `null` when it spells none the dictionary counts — which
 * leaves the seat to §11's 0 points.
 *
 * @param options The tiles the seat may play, and the list that judges them.
 * @returns The submission that spells the winning word, the word, and §7's total for it.
 */
export function evaluateBestWord({ available, dictionary }: SearchWordsOptions): WordCandidate | null {
  if (available.length === 0) {
    return null;
  }

  const key = rackKey(available);
  let memo = memos.get(dictionary);
  if (memo === undefined) {
    memo = new Map();
    memos.set(dictionary, memo);
  }

  const remembered = memo.get(key);
  if (remembered !== undefined) {
    return remembered;
  }

  const found = walk(dictionary, available);

  if (memo.size >= MEMO_LIMIT) {
    // A `Map` iterates in insertion order, so the first key is the oldest rack.
    const oldest = memo.keys().next();
    if (!oldest.done) {
      memo.delete(oldest.value);
    }
  }
  memo.set(key, found);

  return found;
}
