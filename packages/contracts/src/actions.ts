/**
 * What the offline game can be told to do: deal a fresh hand, hand the table to the next
 * round, work on a word during §19's window, or close that window when its clock runs out.
 * Deliberately narrow — betting is out of scope for offline play, so a betting action is
 * absent from the union rather than accepted and ignored.
 *
 * A word action names its seat, where a betting action would not: §19's window is shared by
 * every remaining seat, so there is no turn to read the seat off, and the caller is the table
 * itself. The engine refuses a seat that is not in the window, has already confirmed, or is
 * out of time — naming a seat is a claim, not an authority.
 */

import type { PlayerId } from "./players";
import type { WordSubmission } from "./words";

export type OfflineAction =
  | { type: "deal" }
  | { type: "advance" }
  | { type: "draftWord"; playerId: PlayerId; submission: WordSubmission }
  | { type: "confirmWord"; playerId: PlayerId; submission: WordSubmission }
  | { type: "timeoutWords" };
