/**
 * bot.ts — the offline opponent: a written-down ordering of legal moves, and the best word
 * its tiles can spell.
 *
 * Deliberately simple (STO-284 guardrails): the bot's betting is an ordered behavior tree
 * whose leaves are all `bettingBounds`' enablement flags, so it can only ever pick an action
 * the engine would accept — a bot that guesses at legality stalls a hand. Its rolls come from
 * the hand's seed and the seat's place in the turn (AGENTS.md — no ambient randomness), so the
 * same table always gets the same play from the same seat, and a test can pin a whole bot line
 * by pinning the seed. The tree's shape is the policy, and it is written down for the same
 * reason: "deterministic" has to be checkable.
 *
 * Extension point: STO-271 ("Deterministic tutorial and offline bots") replaces the bodies
 * with the heuristic search — bet sizing, word potential — and keeps the signatures and the
 * legality contract.
 */

import {
  ROUND_PHASES,
  type OfflineAction,
  type PlayerId,
  type Tile,
  type TilePlay,
  type WordSubmission,
} from "@wordpoker/contracts";

import { bettingBounds } from "./betting";
import { resolveSubmission } from "./building";
import type { Dictionary } from "./dictionary";
import { OfflineActionError } from "./errors";
import { handSeed, type OfflineState } from "./offline";
import { createRng } from "./rng";
import { scoreWord } from "./scoring";

/** How much of a call the bot will pay before giving the hand up (§23's call amount). */
export const BOT_CALL_THRESHOLD = 100;

/** How often the bot opens a bet when checking is free. */
export const BOT_BET_FREQUENCY = 0.2;

/**
 * The sizes the bot opens for — the table's minimum bet and its next two steps. A size the
 * stack cannot cover falls through the tree: the bot never shoves on purpose (that is what
 * an all-in action is for, and the bot does not take it).
 */
export const BOT_BET_SIZES = [20, 40, 60] as const;

/** How often the bot raises rather than settling for a call. */
export const BOT_RAISE_FREQUENCY = 0.15;

/**
 * Salt for the bot's rolls: a stream of its own, named by the hand, the street and the seat to
 * act, so one seat's decision cannot shift another's.
 */
const BOT_ROLL_SALT = 0x0b07_5eed;

/**
 * What `botId` plays on its turn.
 *
 * At `payout` the hand is over and there is no turn left, so the only move that keeps the
 * table moving is a fresh deal. During §19's word window there is no turn at all — a bot's
 * word comes from {@link chooseOfflineWord}, which the caller plays for it — so asking this
 * function during the window is a caller bug that gets named rather than silently answered.
 *
 * On a betting turn the leaves are tried in order, first match acting:
 *
 * 1. checking is free and the roll says bet, for a size the stack covers → `bet`;
 * 2. checking is free → `check`;
 * 3. facing a bet bigger than the threshold → `fold`;
 * 4. the roll says raise and the stack covers the floor raise → `raise` to the floor;
 * 5. a call is owed (a short stack's call goes all in — the engine caps it, §23) → `call`;
 * 6. nothing left → `fold`, which the enablement flags say is unreachable.
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

  const toAct = state.toActIndex;
  if (toAct === null) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  const acting = state.seats[toAct];
  if (acting === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  if (acting.id !== botId) {
    throw new OfflineActionError(`${botId} is not to act at ${state.phase}; ${acting.id} is`);
  }

  const betting = state.betting;
  if (betting === null) {
    throw new OfflineActionError(`no betting round is open at ${state.phase}`);
  }

  const bounds = bettingBounds(state.seats, betting, toAct, state.stakes.minBet);
  if (bounds === null) {
    throw new OfflineActionError(`${botId} cannot act at ${state.phase}`);
  }

  const rng = createRng(handSeed(state) + BOT_ROLL_SALT + ROUND_PHASES.indexOf(state.phase) * 31 + toAct);
  const betRoll = rng();
  const sizeRoll = rng();
  const size = BOT_BET_SIZES[Math.floor(sizeRoll * BOT_BET_SIZES.length)];

  if (bounds.canCheck && betRoll < BOT_BET_FREQUENCY && size !== undefined && size <= acting.stack) {
    return { type: "bet", playerId: botId, amount: size };
  }
  if (bounds.canCheck) {
    return { type: "check", playerId: botId };
  }
  if (bounds.callAmount > BOT_CALL_THRESHOLD) {
    return { type: "fold", playerId: botId };
  }
  if (bounds.canRaise && betRoll < BOT_RAISE_FREQUENCY && bounds.minRaiseTo <= bounds.maxRaiseTo) {
    return { type: "raise", playerId: botId, amount: bounds.minRaiseTo };
  }
  if (bounds.canCall) {
    return { type: "call", playerId: botId };
  }

  // Unreachable while a seat that can act always has fold and an amount it can pay or refuse;
  // spelled out so the function has no path that returns nothing.
  return { type: "fold", playerId: botId };
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
