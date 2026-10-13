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

/** Exact search, pruned only when the dictionary rules out every continuation. */
export function evaluateBestWord({ available, dictionary }: ChooseWordOptions): BotWord | null {
  const played: TilePlay[] = [];
  const used = new Set<string>();
  let best: BotWord | null = null;
  const visit = (word: string): BotWord | null => {
    if (word.length >= 2 && dictionary.isWord(word)) {
      const submission = { plays: [...played] };
      const resolution = resolveSubmission({ available, submission });
      if (resolution.ok) {
        const candidate = { submission, word, score: scoreWord(resolution.tiles).total };
        if (best === null || better(candidate, best)) best = candidate;
      }
    }
    if (played.length === 7) return best;
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
    return best;
  };
  return visit("");
}

/** Same scoring, length and alphabetical tie-break as the original word picker. */
export function chooseOfflineWord(options: ChooseWordOptions): WordSubmission | null {
  return evaluateBestWord(options)?.submission ?? null;
}
