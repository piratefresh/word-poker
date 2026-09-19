/**
 * bot.ts — the offline opponent: the same legal move, every turn.
 *
 * Deliberately trivial (STO-284 guardrails): with no betting in this slice, the only legal
 * offline *turn* action is to progress the round, so the bot does exactly that — it passes
 * its turn, and the last seat's pass rolls the street. Its one decision is §19's word: the
 * best word its tiles can spell, searched against the table's dictionary and picked by a
 * written-down order. Both are pure functions of what they are handed — no clock, no random
 * source — so the same table always gets the same play from the same seat.
 *
 * Extension point: STO-271 ("Deterministic tutorial and offline bots") replaces the bodies
 * with the heuristic search — bet sizing, word potential — and keeps the signatures and the
 * legality contract.
 */

import type { OfflineAction, PlayerId, Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import { resolveSubmission } from "./building";
import type { Dictionary } from "./dictionary";
import { OfflineActionError, type OfflineState } from "./offline";
import { scoreWord } from "./scoring";

/**
 * What `botId` plays on its turn.
 *
 * At `payout` the hand is over and there is no turn left, so the only move that keeps the
 * table moving is a fresh deal. During §19's word window there is no turn at all — a bot's
 * word comes from {@link chooseOfflineWord}, which the caller plays for it — so asking this
 * function during the window is a caller bug that gets named rather than silently answered.
 * Everywhere else the bot passes its turn, which is what walks the round.
 *
 * Throws when the bot is not the seat to act — a caller that skipped the turn order has a
 * bug, and a move applied out of turn would desync the table silently.
 */
export function decideOfflineMove(state: OfflineState, botId: PlayerId): OfflineAction {
  if (state.phase === "payout") return { type: "deal" };

  // The window is shared and has no seat to act, so a bot that is asked for one has nothing
  // to answer with: its slot runs out with the clock, like any seat that never confirmed.
  if (state.wordWindow?.status === "open") {
    throw new OfflineActionError(`${botId} has no word to play: the table is in its word window`);
  }

  const acting = state.toActIndex === null ? undefined : state.seats[state.toActIndex];
  if (acting === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  if (acting.id !== botId) {
    throw new OfflineActionError(`${botId} is not to act at ${state.phase}; ${acting.id} is`);
  }

  return { type: "advance" };
}

/** What a seat's word search is handed: the tiles it holds, and the words that count. */
export interface ChooseWordOptions {
  /** Every tile the seat may play: its private tiles plus the community board (§12). */
  readonly available: readonly Tile[];
  readonly dictionary: Dictionary;
}

/** One buildable candidate: the submission that spells it, and what §7 says it is worth. */
interface Candidate {
  readonly submission: WordSubmission;
  readonly word: string;
  readonly score: number;
}

/**
 * Which of two candidates the bot prefers: §7's score, then §21.1's letter count, then the
 * word itself, A–Z first.
 *
 * The order is the policy, and it is written down because "stable" has to be checkable: a bot
 * that picked by score alone would answer a different word whenever two score alike, and the
 * same table would stop replaying the same way.
 */
function better(candidate: Candidate, best: Candidate): boolean {
  if (candidate.score !== best.score) {
    return candidate.score > best.score;
  }
  if (candidate.word.length !== best.word.length) {
    return candidate.word.length > best.word.length;
  }
  return candidate.word < best.word;
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

/**
 * The word a seat with nobody behind it confirms: the best word its tiles can spell, or
 * `null` when they spell none it could submit — which leaves the seat to §11's 0 points.
 *
 * Every order of every subset of the seat's physical tiles is tried, and each one that
 * evaluates (§10–§12) and is in the dictionary becomes a candidate, so the search is over the
 * words the tiles can actually spell rather than over a word list. A hand is at most seven
 * physical tiles, so the walk is bounded and small; the policy picks the winner.
 *
 * @param options The seat's tiles and the table's dictionary.
 * @returns A submission ready for the window's confirm action, or `null` for no word.
 */
export function chooseOfflineWord({ available, dictionary }: ChooseWordOptions): WordSubmission | null {
  const played: TilePlay[] = [];
  const used = new Set<string>();
  let best: Candidate | null = null;

  const visit = (): Candidate | null => {
    if (played.length > 0) {
      const submission: WordSubmission = { plays: [...played] };
      const resolution = resolveSubmission({ available, submission });

      // A word of one letter never gets here: §12's floor is checked where every submission
      // is checked, so this search and the window cannot disagree about what can be built.
      if (resolution.ok && dictionary.isWord(resolution.word)) {
        const candidate: Candidate = {
          submission,
          word: resolution.word,
          score: scoreWord(resolution.tiles).total,
        };
        if (best === null || better(candidate, best)) {
          best = candidate;
        }
      }
    }

    for (const tile of available) {
      if (used.has(tile.id)) {
        continue;
      }
      for (const play of faceOptions(tile)) {
        used.add(tile.id);
        played.push(play);
        visit();
        played.pop();
        used.delete(tile.id);
      }
    }

    return best;
  };

  // Read through the walk's return type rather than the initialiser the compiler narrowed to:
  // the assignment happens inside `visit`, and TS does not track that from out here.
  return visit()?.submission ?? null;
}
