/**
 * errors.ts — the engine's refusals, in the one module that both halves of the hand can import.
 *
 * {@link OfflineActionError} is "the action does not fit the table it was handed": dealing
 * mid-hand, betting outside a round, drafting for a seat that is not in §19's window. Its two
 * subclasses are the refusals a seat can fix — a word §11 will not take, a betting action
 * §15/§22/§23 will not take — and each carries the reason, ready to be shown to the seat that
 * sent it.
 *
 * They live here rather than beside the reducer so that the hand and §19's window can each
 * refuse an action without importing one another.
 */

import type { BettingRejectionReason, WordRejectionReason } from "@wordpoker/contracts";

/**
 * An action that does not fit the state it was handed — dealing mid-hand, betting outside a
 * round, drafting for a seat that is not in the window. Named so a caller can tell an engine
 * refusal from a programming error, and the message names where the table was.
 */
export class OfflineActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineActionError";
  }
}

/**
 * A word action the engine refused the way §11 refuses a submission: the payload never became
 * the seat's word, and `reason` says why. Separate from {@link OfflineActionError} because
 * this one is the player's to fix — a word too short, a tile they do not hold, a clock they
 * missed — while the other means the action did not fit the table at all.
 */
export class WordRejectionError extends OfflineActionError {
  /** §11's reason, ready to be shown to the seat that sent it. */
  readonly reason: WordRejectionReason;

  constructor(reason: WordRejectionReason) {
    super(`the word was refused: ${reason}`);
    this.name = "WordRejectionError";
    this.reason = reason;
  }
}

/**
 * A betting action the engine refused the way §15 refuses one: the chips never moved, and
 * `reason` says why. The betting twin of {@link WordRejectionError}, and for the same reason:
 * "it is not your turn" is the table's answer, not a programming error.
 */
export class BettingRejectionError extends OfflineActionError {
  /** §15/§22/§23's reason, ready to be shown to the seat that sent it. */
  readonly reason: BettingRejectionReason;

  constructor(reason: BettingRejectionReason) {
    super(`the betting action was refused: ${reason}`);
    this.name = "BettingRejectionError";
    this.reason = reason;
  }
}
