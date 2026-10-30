/** The pure, deterministic engine: no I/O, no framework, no ambient clock or randomness. */

export { LETTER_VALUES } from "./tiles/letters";
export type { Letter } from "./tiles/letters";
export { createRng, mixSeed } from "./core/rng";
export type { PowerSeedSalt } from "./core/rng";
export { weightedSampleWithoutReplacement } from "./core/sample";
export { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER, dealHand, shuffle } from "./tiles/deal";
export { fixedDeal } from "./tiles/fixed-deal";
export type { FixedDealSpec } from "./tiles/fixed-deal";
export { NotEnoughTilesError, TILE_BAG_SIZE, createTileBag, draw } from "./tiles/tiles";
export {
  CHOICE_TILE_PAIRS,
  DEFAULT_SPECIAL_TILES,
  NO_SPECIAL_TILES,
  TWO_LETTER_TILE_LIMIT,
  applySpecialTiles,
} from "./tiles/special-tiles";
export type { SpecialTilesConfig, SpecialTilesResult } from "./tiles/special-tiles";
export { evaluateWord, resolveSubmission, spellSubmission } from "./words/building";
export type { EvaluateWordOptions, ResolveSubmissionOptions, SubmissionResolution } from "./words/building";
export {
  DICTIONARIES,
  DictionaryArtifactError,
  createDictionary,
  loadDictionary,
} from "./words/dictionary";
export type {
  Dictionary,
  DictionaryArtifact,
  DictionaryInfo,
  DictionarySource,
} from "./words/dictionary";
export {
  DRAW_SEED_SALT,
  DrawPoolExhaustedError,
  NoContestantsError,
  rankShowdown,
  showdownDrawPool,
  showdownDrawValue,
} from "./money/showdown";
export type { RankShowdownOptions, ShowdownEntry } from "./money/showdown";
export { decideOfflineMove, chooseOfflineWord } from "./bot/bot";
export type { ChooseWordOptions } from "./bot/bot";
export { evaluateBestWord, topWords } from "./bot/bot-word";
export { RIVER_REVIEW_WORDS, riverReview } from "./words/river-review";
export type { BotWord } from "./bot/bot-word";
export {
  OFFLINE_TURN_MS,
  availableTiles,
  canUsePower,
  handSeed,
  reduce,
  revealedCount,
  startHand,
} from "./table/offline";
export {
  TUTORIAL_HERO,
  TUTORIAL_MAX_RAISE_TO,
  TUTORIAL_PLAYERS,
  TUTORIAL_RAISE_TO,
  TUTORIAL_SCRIPT,
  TUTORIAL_SEED,
  TUTORIAL_TARGET_WORD,
  TUTORIAL_VERSION,
  applyTutorialAction,
  nextScriptedAction,
  startTutorial,
  tutorialCheckpoint,
} from "./table/tutorial";
export type {
  StartTutorialOptions,
  TutorialApply,
  TutorialCheckpoint,
  TutorialDivergence,
  TutorialHeroMove,
  TutorialRun,
  TutorialStep,
} from "./table/tutorial";
export type {
  HandPowers,
  HandResult,
  OfflineSeat,
  OfflineStanding,
  OfflineState,
  StartHandOptions,
} from "./table/offline";
export { RULES_VERSION, replayHand, summarizeHand, verifyHandRecord } from "./table/replay";
export type {
  ReplayOutcome,
  ReplayRefusal,
  ReplayRefusalKind,
  ReplayRefused,
  ReplayVerified,
} from "./table/replay";
export {
  BettingRejectionError,
  OfflineActionError,
  PowerRejectionError,
  WordRejectionError,
} from "./core/errors";
export { drawOffers } from "./powers/power-draw";
export type { DrawSlot, HeldPower, PowerDraw } from "./powers/power-draw";
export { isSwappedTileId, swappedTileId } from "./powers/power-swap";
export { WORD_WINDOW_MS } from "./words/word-window";
export type { WordSlot, WordWindow } from "./words/word-window";
export { scoreWord } from "./words/scoring";
export { playedWord } from "./words/played-word";
export type { PlayedWord } from "./words/played-word";
export { awardChips, commitChips } from "./money/chips";
export type { ChipSeat, CommitResult } from "./money/chips";
export { DEFAULT_STAKES, applyBettingAction, bettingBounds, nextActor } from "./money/betting";
export type {
  BettingApply,
  BettingBounds,
  BettingRoundState,
  BettingSeatState,
  BettingStep,
  BettingStepStatus,
  Stakes,
} from "./money/betting";
export { buildLivePots, buildPots, resolvePayout, splitAward } from "./money/pots";
export type { JudgedSeat, PotContest, ResolvePayoutOptions, ResolvedPayout } from "./money/pots";
export { chooseBotPower, decideBotPowerUse } from "./bot/bot-power";
export { QUEST_CATALOG, applyQuestHand, emptyQuestProgress } from "./quests";
export type { QuestDefinition, QuestProgressEntry, QuestProgressMap } from "./quests";
export {
  LEVEL_REWARD_BASE,
  LEVEL_XP_BASE,
  XP_PER_HAND,
  XP_WIN_BONUS,
  levelForXp,
  levelReward,
  xpForHand,
  xpToReach,
} from "./xp";
export type { LevelStanding } from "./xp";
