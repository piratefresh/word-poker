/** The pure, deterministic engine: no I/O, no framework, no ambient clock or randomness. */

export { LETTER_VALUES } from "./letters";
export type { Letter } from "./letters";
export { createRng } from "./rng";
export { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER, dealHand, shuffle } from "./deal";
export { NotEnoughTilesError, TILE_BAG_SIZE, createTileBag, draw } from "./tiles";
export {
  DEFAULT_SPECIAL_TILES,
  NO_SPECIAL_TILES,
  SEQUENCE_TILE_PAIRS,
  TWO_LETTER_TILE_LIMIT,
  applySpecialTiles,
} from "./special-tiles";
export type { SpecialTilesConfig, SpecialTilesResult } from "./special-tiles";
export { evaluateWord, resolveSubmission } from "./building";
export type { EvaluateWordOptions, ResolveSubmissionOptions, SubmissionResolution } from "./building";
export {
  DICTIONARIES,
  DictionaryArtifactError,
  createDictionary,
  loadDictionary,
} from "./dictionary";
export type {
  Dictionary,
  DictionaryArtifact,
  DictionaryInfo,
  DictionarySource,
} from "./dictionary";
export {
  DrawPoolExhaustedError,
  NoContestantsError,
  rankShowdown,
  showdownDrawPool,
  showdownDrawValue,
} from "./showdown";
export type { RankShowdownOptions, ShowdownEntry } from "./showdown";
export { decideOfflineMove } from "./bot";
export {
  OFFLINE_TURN_MS,
  OfflineActionError,
  reduce,
  revealedCount,
  startHand,
  WORD_WINDOW_MS,
  WordRejectionError,
} from "./offline";
export type { OfflineSeat, OfflineState, StartHandOptions, WordSlot, WordWindow } from "./offline";
export { NoPlayersError, pickWinner, scoreHand, scoreWord } from "./scoring";
export type { ScoredPlayer } from "./scoring";
