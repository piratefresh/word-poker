/** The wire vocabulary the app and the server agree on: phases, tiles, words, players, actions. */

export { ROUND_PHASES, WAITING_PHASE, type RoomPhase, type RoundPhase } from "./phases";
export { DICTIONARY_IDS, isDictionaryId, type DictionaryId } from "./dictionaries";
export type {
  ChoiceTile,
  LetterMultiplier,
  LetterTile,
  SequenceTile,
  Tile,
} from "./tiles";
export {
  WORD_REJECTION_REASONS,
  isWordSubmission,
  type TileLetter,
  type TilePlay,
  type TilePlayResolution,
  type WordEvaluation,
  type WordLetterScore,
  type WordRejectionReason,
  type WordScore,
  type WordSubmission,
} from "./words";
export {
  SHOWDOWN_DECIDERS,
  type ShowdownComparison,
  type ShowdownComparisonValue,
  type ShowdownDecider,
  type ShowdownRanking,
  type ShowdownStanding,
} from "./showdown";
export {
  BETTING_ACTIONS,
  BETTING_REJECTION_REASONS,
  isBettingAction,
  type BettingAction,
  type BettingActionType,
  type BettingRejectionReason,
  type PayoutResult,
  type PotResult,
  type RoundChips,
  type SeatChips,
  type StackDelta,
} from "./betting";
export type { PlayerId } from "./players";
export type { OfflineAction } from "./actions";
