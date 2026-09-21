/** The wire vocabulary the app and the server agree on: phases, tiles, words, players, actions. */

export {
  ROUND_PHASES,
  WAITING_PHASE,
  isRoomPhase,
  type RoomPhase,
  type RoundPhase,
} from "./phases";
export {
  BUY_IN_PRESETS,
  GAME_ROOM_NAME,
  LOBBY_ROOM_NAME,
  MAX_SEATS,
  MIN_SEATS,
  ROOM_NAME_MAX_LENGTH,
  isBuyInPreset,
  isGameRoomMetadata,
  minBetFor,
  roomSummaryFromListing,
  tableStatus,
  validateRoomCreateOptions,
  type BuyInPreset,
  type GameRoomCreateOptions,
  type GameRoomMetadata,
  type RoomCreateField,
  type RoomCreateRefusal,
  type RoomCreateValidation,
  type RoomSummary,
  type TableStatus,
} from "./rooms";
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
export {
  GAME_EVENTS,
  GAME_MESSAGES,
  isGameMessagePayload,
  isGameRejectionEvent,
  isOnlineBettingAction,
  isOnlineWordAction,
  type GameEventMap,
  type GameMessageMap,
  type GameMessageName,
  type GameMessagePayload,
  type GameRejectionEvent,
  type GameTableState,
  type GameTableConfig,
  type OnlineBettingAction,
  type OnlineHandResult,
  type OnlinePot,
  type OnlineSeatState,
  type OnlineStanding,
  type OnlineWordAction,
  type OnlineWordSlot,
  type OnlineWordWindow,
  type PrivateSeatState,
  type PrivateWordState,
} from "./online";
