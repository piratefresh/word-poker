import type { Tile } from "@wordpoker/contracts";

import type { BotObservation } from "./bot-observation";
import { evaluateBestWord } from "./bot-word";

export interface BotStrength {
  readonly tier: "weak" | "playable" | "strong" | "premium";
  readonly hasWord: boolean;
  readonly potential: boolean;
}

/** Complementary faces help future words; a high printed value alone does not. */
function complementary(tiles: readonly Tile[]): boolean {
  const faces = tiles.map((tile) => "alternativeLetter" in tile
    ? [tile.letter, tile.alternativeLetter]
    : [tile.letter]);
  return faces.some((options, index) => options.some((face) => "AEIOU".includes(face)) &&
    faces.some((other, otherIndex) => otherIndex !== index &&
      other.some((face) => !"AEIOU".includes(face))));
}

/**
 * Ordinal word-quality bands, NOT probabilities or showdown equity.
 * Shared-board words provide no private advantage, even when their raw score is high.
 */
export function assessBotStrength(view: BotObservation): BotStrength {
  const best = evaluateBestWord({ available: [...view.privateTiles, ...view.board], dictionary: view.dictionary });
  const score = best?.score ?? 0;
  const length = best?.word.length ?? 0;
  const hasWord = best !== null;
  const potential = view.board.length < 5 && complementary([...view.privateTiles, ...view.board]);

  if (view.phase === "preflop") {
    const flexible = view.privateTiles.some((tile) => "alternativeLetter" in tile || tile.multiplier !== undefined);
    const tier = score >= 10 || (potential && flexible)
      ? "strong"
      : hasWord || potential || flexible ? "playable" : "weak";
    return { tier, hasWord, potential };
  }

  const board = evaluateBestWord({ available: view.board, dictionary: view.dictionary });
  const edge = score - (board?.score ?? 0);
  const longer = length > (board?.word.length ?? 0);
  const tier = (length === 7 || (score >= 30 && edge >= 12))
    ? "premium"
    : score >= 18 && edge >= 6 ? "strong"
    : hasWord && (edge > 0 || longer) ? "playable" : "weak";
  return { tier, hasWord, potential };
}
