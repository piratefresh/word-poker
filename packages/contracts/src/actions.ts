/**
 * What the offline game can be told to do: deal a fresh hand, hand the table to the next
 * round, or submit a word for the seat whose turn it is. Deliberately narrow — betting is
 * out of scope for offline play, so a betting action is absent from the union rather than
 * accepted and ignored.
 *
 * `submitWord` names no seat: the engine knows whose turn it is, and a payload that could
 * name someone else is a payload a cheating client would send.
 */

import type { WordSubmission } from "./words";

export type OfflineAction =
  | { type: "deal" }
  | { type: "advance" }
  | { type: "submitWord"; submission: WordSubmission };
