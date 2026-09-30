/** The pure, deterministic engine: no I/O, no framework, no ambient clock or randomness. */

export { LETTER_VALUES } from "./letters";
export type { Letter } from "./letters";
export { createRng, mixSeed } from "./rng";
export type { PowerSeedSalt } from "./rng";
export { weightedSampleWithoutReplacement } from "./sample";
export { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER, dealHand, shuffle } from "./deal";
export { NotEnoughTilesError, TILE_BAG_SIZE, createTileBag, draw } from "./tiles";
export {
  CHOICE_TILE_PAIRS,
  DEFAULT_SPECIAL_TILES,
  NO_SPECIAL_TILES,
  TWO_LETTER_TILE_LIMIT,
  applySpecialTiles,
} from "./special-tiles";
export type { SpecialTilesConfig, SpecialTilesResult } from "./special-tiles";
export { evaluateWord, resolveSubmission, spellSubmission } from "./building";
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
  DRAW_SEED_SALT,
  DrawPoolExhaustedError,
  NoContestantsError,
  rankShowdown,
  showdownDrawPool,
  showdownDrawValue,
} from "./showdown";
export type { RankShowdownOptions, ShowdownEntry } from "./showdown";
export { decideOfflineMove, chooseOfflineWord } from "./bot";
export type { ChooseWordOptions } from "./bot";
export {
  OFFLINE_TURN_MS,
  availableTiles,
  canUsePower,
  handSeed,
  reduce,
  revealedCount,
  startHand,
} from "./offline";
export type {
  HandPowers,
  HandResult,
  OfflineSeat,
  OfflineStanding,
  OfflineState,
  StartHandOptions,
} from "./offline";
export {
  BettingRejectionError,
  OfflineActionError,
  PowerRejectionError,
  WordRejectionError,
} from "./errors";
export { drawOffers } from "./power-draw";
export type { DrawSlot, HeldPower, PowerDraw } from "./power-draw";
export { swappedTileId } from "./power-swap";
export { WORD_WINDOW_MS } from "./word-window";
export type { WordSlot, WordWindow } from "./word-window";
export { scoreWord } from "./scoring";
export { playedWord } from "./played-word";
export type { PlayedWord } from "./played-word";
export { awardChips, commitChips } from "./chips";
export type { ChipSeat, CommitResult } from "./chips";
export { DEFAULT_STAKES, applyBettingAction, bettingBounds, nextActor } from "./betting";
export type {
  BettingApply,
  BettingBounds,
  BettingRoundState,
  BettingSeatState,
  BettingStep,
  BettingStepStatus,
  Stakes,
} from "./betting";
export { buildPots, resolvePayout, splitAward } from "./pots";
export type { JudgedSeat, PotContest, ResolvePayoutOptions, ResolvedPayout } from "./pots";
