import type { Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import { resolveSubmission } from "../words/building";
import type { Dictionary } from "../words/dictionary";
import { scoreWord } from "../words/scoring";

export interface ChooseWordOptions {
  readonly available: readonly Tile[];
  readonly dictionary: Dictionary;
}

export interface BotWord {
  readonly submission: WordSubmission;
  readonly word: string;
  readonly score: number;
}

function better(candidate: BotWord, best: BotWord): boolean {
  if (candidate.score !== best.score) return candidate.score > best.score;
  if (candidate.word.length !== best.word.length) return candidate.word.length > best.word.length;
  return candidate.word < best.word;
}

/**
 * Exact search for the best `count` distinct words, pruned only when the dictionary rules out every
 * continuation. A word reachable by two tile orders keeps its better-scoring play.
 */
export function topWords({ available, dictionary }: ChooseWordOptions, count: number): BotWord[] {
  const played: TilePlay[] = [];
  const used = new Set<string>();
  const found = new Map<string, BotWord>();
  const visit = (word: string): void => {
    if (word.length >= 2 && dictionary.isWord(word)) {
      const submission = { plays: [...played] };
      const resolution = resolveSubmission({ available, submission });
      if (resolution.ok) {
        const candidate = { submission, word, score: scoreWord(resolution.tiles).total };
        const prior = found.get(word);
        if (prior === undefined || candidate.score > prior.score) found.set(word, candidate);
      }
    }
    if (played.length === 7) return;
    for (const tile of available) {
      // ponytail: CPUs never play a blank (0 points, 26x branching); try A-Z if the bots look dumb.
      if (used.has(tile.id) || "blank" in tile) continue;
      const faces = "alternativeLetter" in tile ? [tile.letter, tile.alternativeLetter] : [tile.letter];
      for (const face of faces) {
        const next = word + face;
        if (dictionary.hasPrefix?.(next) === false) continue;
        used.add(tile.id);
        played.push("alternativeLetter" in tile ? { tileId: tile.id, chosenFace: face } : { tileId: tile.id });
        visit(next);
        played.pop();
        used.delete(tile.id);
      }
    }
  };
  visit("");
  return [...found.values()].sort((a, b) => (better(a, b) ? -1 : 1)).slice(0, count);
}

/** The single best word, or null when nothing is buildable. */
export function evaluateBestWord(options: ChooseWordOptions): BotWord | null {
  return topWords(options, 1)[0] ?? null;
}

/** Same scoring, length and alphabetical tie-break as the original word picker. */
export function chooseOfflineWord(options: ChooseWordOptions): WordSubmission | null {
  return evaluateBestWord(options)?.submission ?? null;
}

/**
 * The best word to show a player what they missed. Words tie on score often (BANKS, BONKS and
 * KNOBS all score 14 on one deal), so among the best the word that plays more of the player's own
 * tiles comes first, then the longer word, then alphabetical order.
 *
 * @param own Ids of the player's own (private) tiles.
 */
export function bestWordToTeach({ available, dictionary }: ChooseWordOptions, own: ReadonlySet<string>): BotWord | null {
  // Every word, not a short list: a tie can be longer than any fixed cut.
  const words = topWords({ available, dictionary }, Number.MAX_SAFE_INTEGER);
  const ceiling = words[0]?.score;
  const held = (word: BotWord) => word.submission.plays.filter((play) => own.has(play.tileId)).length;
  return (
    words
      .filter((word) => word.score === ceiling)
      .sort((a, b) => held(b) - held(a) || b.word.length - a.word.length || (a.word < b.word ? -1 : 1))[0] ?? null
  );
}
