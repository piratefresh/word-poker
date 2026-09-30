/**
 * What the offline game can be told to do: deal a fresh hand, keep a power at §44's Power Draw,
 * take a betting action, work on a word during §19's window, or close either window when its
 * clock runs out.
 *
 * Both a betting action and a word action name their seat — a bet because whose turn it is
 * still has to be claimed and checked, and §19's window because it is shared by every
 * remaining seat, so there is no turn to read the seat off at all. The engine refuses a seat
 * that is not the one to act, is not in the window, has already confirmed, or is out of
 * time: naming a seat is a claim, not an authority.
 */

import type { BettingAction } from "./betting";
import type { PlayerId } from "./players";
import type { PowerUpId } from "./powers";
import type { WordSubmission } from "./words";

export type OfflineAction =
  | { type: "deal" }
  | BettingAction
  | { type: "checkWord"; playerId: PlayerId; submission: WordSubmission }
  | { type: "draftWord"; playerId: PlayerId; submission: WordSubmission }
  | { type: "confirmWord"; playerId: PlayerId; submission: WordSubmission }
  /** The server's betting clock expired; clients never send this action. */
  | { type: "timeoutTurn" }
  /** The server folds the acting seat — a disconnected seat when action reaches it (§29); clients never send this action. */
  | { type: "foldTurn" }
  | { type: "timeoutWords" }
  /** A seat keeps one of the powers the Power Draw offered it (§44). */
  | { type: "pickPower"; playerId: PlayerId; powerUpId: PowerUpId }
  /** The Power Draw's clock ran out: every seat that has not picked keeps its first offer. */
  | { type: "timeoutPowerDraw" };
