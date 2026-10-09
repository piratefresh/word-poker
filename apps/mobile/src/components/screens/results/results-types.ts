/**
 * results-types.ts — the results screen's payload: one settled hand, frozen.
 *
 * The screen never sorts, ranks or sums: the engine already decided every number
 * (`rankShowdown` places the seats, `scoreWord` prices their words, `resolvePayout` pays the
 * pots), so this is the shape those answers are handed over in, built once by
 * `results-snapshot.ts` and rendered by the surface under it. Entries arrive in the ladder's
 * order, the tiles arrive in word order, and nothing here is read from a live state again.
 *
 * The headline's pieces travel with the payload because the gold span is typography, not
 * state: `results-copy.ts` builds them, and no view concatenates a sentence of its own
 * (STO-379 decision 12).
 */

import type { PlayerId, ShowdownDecider, Tile, WordRejectionReason } from "@wordpoker/contracts";

/** One seat as the results draw it: who it is, what it played, and what that was worth. */
export interface ResultsSeat {
  readonly playerId: PlayerId;
  /** Roster identity, exactly as the felt draws the same seat. */
  readonly name: string;
  readonly initials: string;
  readonly color: string;
  /** Whether this seat is the local player's — the italic `(you)` the card prints. */
  readonly isYou: boolean;
  /** Folded seats appear after the showdown standings, without a word or score. */
  readonly folded: boolean;
  /**
   * The word the seat's tiles spelled, uppercase, or `null` when it confirmed none (§11).
   * A seat that reached the reveal with nothing is a card at 0, never a missing card.
   */
  readonly word: string | null;
  /**
   * The physical tiles the seat played, in word order (§10) — a choice tile carries both its
   * faces. Never re-sorted: the word's order *is* this order, and every tile covers the one
   * letter it played.
   */
  readonly tiles: readonly Tile[];
  /** §7 step 1: the letters' printed values, before any tile multiplier. */
  readonly base: number;
  /** §7 step 2: what the tile multipliers added — Σ(`value` − `baseValue`). */
  readonly mult: number;
  /** §7 step 3: the Full Rack Bonus, `+10` when every tile of the rack was used, else 0. */
  readonly rack: number;
  /** §7: the seat's final score, the number §21's ladder ranked it by. */
  readonly total: number;
  /** §21's 1-based showdown place; 0 for a folded seat outside the ladder. */
  readonly place: number;
  /** Whether the hand's pots paid this seat — the card's gold and its `★ TAKES THE POT`. */
  readonly takesPot: boolean;
  /** §11's reason the seat scored nothing, or `null` when its word stood. */
  readonly reason: WordRejectionReason | null;
  /** What §21's ladder decided this seat's place by, or `null` for the fold-out's one card. */
  readonly decidedBy: ShowdownDecider | null;
}

/** The headline's pieces: the two spans of the sentence, and the line under the pot. */
export interface ResultsHeadline {
  /** The serif sentence up to the emphasis: `Ellis takes`. */
  readonly lead: string;
  /** The one gold italic span: `the pot`. */
  readonly emphasis: string;
  /** The mono line under the pot: `ELLIS MARCH · ENVIRO · 17 PTS`. */
  readonly subline: string;
}

/** The table the hand was played at, as the scoreboard's head counts it. */
export interface ResultsTable {
  /** Every seat dealt into the hand, folded or not. */
  readonly players: number;
  /** How many of them folded and did not participate in the reveal (§20). */
  readonly folded: number;
}

/** One settled hand, as the results screen renders it. Frozen on mount; nothing here is live. */
export interface ResultsSnapshot {
  /** The hand whose payout this is, 1-based — the header's `HAND #N`. */
  readonly hand: number;
  /**
   * The seed this hand was dealt from, so a rating can be replayed: the engine derives every
   * later hand from the seed before it, and this is the one this hand replayed from.
   *
   * `null` online: the room's seed derives every hand it will deal next, so it never leaves the
   * server, and the screen carries no rating card for a hand it cannot replay.
   */
  readonly seed: number | null;
  /** Every chip the hand's pots hold: what the pot counts 0 up to, and settles on exactly. */
  readonly pot: number;
  /**
   * Whether the hand reached §20's reveal. A fold-out (§26) has no reveal at all: it is one
   * winner followed by the folded seats, and the copy says so.
   */
  readonly revealed: boolean;
  readonly table: ResultsTable;
  /** Showdown standings best first (§20, §21), followed by the folded seats. */
  readonly seats: readonly ResultsSeat[];
  /** The headline, built by `results-copy.ts`. */
  readonly headline: ResultsHeadline;
  /** `4 PLAYERS · 1 FOLD · 3 WORDS PLAYED`, built by `results-copy.ts`. */
  readonly summary: string;
}
