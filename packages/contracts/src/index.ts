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
  type TilePlay,
  type TilePlayResolution,
  type WordEvaluation,
  type WordRejectionReason,
  type WordScore,
  type WordSubmission,
} from "./words";
export type { PlayerId } from "./players";
export type { OfflineAction } from "./actions";
